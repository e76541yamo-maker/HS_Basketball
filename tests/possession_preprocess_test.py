import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from preprocess_possessions import build, Season


class PossessionTest(unittest.TestCase):
    def setUp(self):
        self.tracking = {'players': {str(i): {'team': 'CLE' if i < 6 else 'GSW'} for i in range(1, 11)},
                         'holds': [{'q': 1, 'team': 'CLE', 'clock': 720, 'positions': [[i, 0, 0] for i in range(1, 11)]}]}

    def row(self, kind, clock, team='', pid='1', text='', score='', action='0'):
        return {'GAME_ID': '0021500438', 'PERIOD': '1', 'EVENTMSGTYPE': str(kind), 'PCTIMESTRING': clock,
                'PLAYER1_TEAM_ABBREVIATION': team, 'PLAYER1_ID': pid, 'PLAYER2_ID': '2',
                'PLAYER3_TEAM_ABBREVIATION': '', 'EVENTMSGACTIONTYPE': action, 'EVENTNUM': '1',
                'HOMEDESCRIPTION': text, 'VISITORDESCRIPTION': '', 'NEUTRALDESCRIPTION': '', 'SCORE': score}

    def test_offensive_rebounds_stay_inside_possession_and_team_defensive_rebound_ends_it(self):
        rows = [self.row(12, '12:00'), self.row(2, '11:45', 'CLE'), self.row(4, '11:44', 'CLE', text='REBOUND (Off:1 Def:0)'),
                self.row(2, '11:30', 'CLE'), self.row(4, '11:29', pid='1610612744', text='WARRIORS Rebound'),
                self.row(1, '11:10', 'GSW', '6', score='0 - 2'), self.row(13, '0:00')]
        x = build(rows, self.tracking)
        self.assertEqual(len(x['possessions']), 3)
        self.assertEqual(x['possessions'][0]['offensiveRebounds'], 1)
        self.assertEqual(x['possessions'][0]['outcome'], 'defensiveRebound')
        self.assertEqual(x['possessions'][1]['team'], 'GSW')

    def test_and_one_and_nonfinal_free_throw_placeholders_do_not_split_possessions(self):
        rows = [self.row(12, '12:00'), self.row(1, '11:45', 'CLE', score='2 - 0'),
                self.row(6, '11:45', 'GSW', '6', 'S.FOUL (P1.T1)', action='2'),
                self.row(3, '11:45', 'CLE', text='Free Throw 1 of 1', score='3 - 0', action='10'),
                self.row(6, '11:20', 'CLE', text='S.FOUL (P1.T1)', action='2'),
                self.row(3, '11:20', 'GSW', '6', 'MISS Free Throw 1 of 2', action='11'),
                self.row(4, '11:20', pid='1610612744', text='WARRIORS Rebound'),
                self.row(3, '11:20', 'GSW', '6', 'Free Throw 2 of 2', score='3 - 1', action='12'), self.row(13, '0:00')]
        x = build(rows, self.tracking)
        self.assertEqual(len(x['possessions']), 3)
        self.assertEqual(x['possessions'][0]['points']['CLE'], 3)
        self.assertEqual(x['possessions'][1]['offensiveRebounds'], 0)
        self.assertEqual(x['possessions'][1]['end']['personalFouls']['1'], 1)

    def test_empty_and_wrong_game_are_rejected_and_season_rows_parse(self):
        with self.assertRaises(ValueError): build([], self.tracking)
        with self.assertRaises(ValueError): build([{**self.row(1, '12:00'), 'GAME_ID': 'wrong'}], self.tracking)
        p = Season(); p.feed('<table id="per_game_stats"><tr><td data-stat="name_display">Stephen Curry</td><td data-stat="pts_per_g">30.1</td></tr></table>')
        self.assertEqual(p.rows[0][1]['pts_per_g'], '30.1')

    def test_offensive_foul_window_follows_turnover(self):
        rows = [self.row(12, '12:00'), self.row(6, '2:36', 'GSW', '6', 'OFF.Foul', action='4'),
                self.row(5, '2:36', 'GSW', '6', 'Offensive Foul Turnover'),
                self.row(1, '2:20', 'CLE', score='2 - 0'), self.row(13, '0:00')]
        x = build(rows, self.tracking)
        windows = [w for w in x['windows'] if w['state']['clock'] == 156]
        self.assertTrue(windows)
        self.assertTrue(all(x['possessions'][w['possessionIndex']]['team'] == 'CLE' for w in windows))

    def test_committed_windows_cover_every_dead_ball_and_late_possession(self):
        x = json.loads((Path(__file__).resolve().parents[1]/'src/possession-game.json').read_text())
        for p in x['possessions']:
            windows = [w for w in x['windows'] if w['possessionIndex'] == p['id']]
            self.assertTrue(windows)
            for e in p['events']:
                if e['kind'] in (6, 7, 8, 9, 12):
                    self.assertTrue(any(w['state']['clock'] == e['clock'] for w in windows) or e['clock'] == p['end']['clock'])


if __name__ == '__main__': unittest.main()
