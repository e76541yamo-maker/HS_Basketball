import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from preprocess_tracking import owner, zone, build


class TrackingTest(unittest.TestCase):
    def test_control_radius_height_and_missing_samples(self):
        moment = [1, 0, 700, 20, None, [[-1, -1, 10, 10, 2]] + [[1, i+1, 10+i*5, 10, 0] for i in range(10)]]
        self.assertEqual(owner(moment), 1)
        moment[5][0][4] = 8
        self.assertIsNone(owner(moment))
        moment[5][0][4] = 2
        moment[5][0][3] = 20
        self.assertIsNone(owner(moment))
        moment[5] = []
        self.assertIsNone(owner(moment))

    def test_court_sides_and_wrong_game_rejected(self):
        self.assertEqual(zone(7, 25, 5.25), 'rim')
        self.assertEqual(zone(80, 25, 5.25), 'backcourt')
        self.assertEqual(zone(87, 25, 88.75), 'rim')
        with self.assertRaises(ValueError):
            build(json.dumps({'gameid': 'wrong'}).encode(), '', '')

    def test_distributions_and_passes_are_derived_not_substituted(self):
        game = json.loads((Path(__file__).resolve().parents[1]/'src/tracking-game.json').read_text())
        for pid, d in game['distributions'].items():
            self.assertEqual(len(d['durations']), d['holds'])
            self.assertEqual(sum(d['targets'].values()), sum(h['endKind']=='pass' for h in game['holds'] if h['player']==pid))
            self.assertEqual(sum(sum(c.values()) for c in d['choices'].values()), d['holds'])
        for i, h in enumerate(game['holds'][:-1]):
            if h['endKind'] == 'pass':
                n = game['holds'][i+1]
                self.assertNotEqual(h['player'], n['player'])
                self.assertEqual(h['target'], n['player'])
                self.assertEqual(h['team'], n['team'])
                self.assertFalse(any(h['t']-.01 <= e['t'] <= n['t']+.01 for e in game['events']))
