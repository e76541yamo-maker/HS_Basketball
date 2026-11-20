"""Offline model inputs from cached public Basketball Reference HTML.

Requires the raw files downloaded for preprocess_tracking/possessions. --download
refreshes the two 2015-16 team pages; normal browser use is completely offline.
"""
import argparse
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import unicodedata
import urllib.request

from preprocess_tracking import Box

ROOT = Path(__file__).resolve().parent
FIELDS = ('fg', 'fg3', 'fga', 'ft', 'fta', 'orb', 'drb', 'tov')


class Tables(HTMLParser):
    def __init__(self):
        super().__init__(); self.table = ''; self.row = {}; self.key = None; self.rows = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'table': self.table = attrs.get('id', '')
        if tag == 'tr': self.row = {}
        if tag in ('th', 'td'):
            self.key = attrs.get('data-stat')
            if self.key: self.row[self.key] = ''

    def handle_data(self, text):
        if self.key: self.row[self.key] += text

    def handle_endtag(self, tag):
        if tag in ('th', 'td'): self.key = None
        if tag == 'tr' and self.table: self.rows.append((self.table, self.row))
        if tag == 'table': self.table = ''


def name(value):
    return ''.join(c for c in unicodedata.normalize('NFD', value.replace('*', '').strip()) if not unicodedata.combining(c))


def counts(row, season=False):
    result = {k: float(row[k+'_per_g' if season else k]) for k in FIELDS}
    if season: result['minutes'] = float(row['mp_per_g'])
    else:
        m, s = row['mp'].split(':'); result['minutes'] = int(m)+int(s)/60
    return result


def build(tracking, possessions, season_html, box_html):
    box = Box(); box.feed(box_html.replace('<!--', '').replace('-->', ''))
    game_teams = {t: {k: int(r[k]) for k in FIELDS} for t, r in box.rows if r.get('player') == 'Team Totals'}
    if set(game_teams) != {'CLE', 'GSW'}: raise ValueError('Missing game team totals')
    players = {}; teams = {}
    for team, html in season_html.items():
        parser = Tables(); parser.feed(html.replace('<!--', '').replace('-->', ''))
        totals = {r['player']: {k: int(r[('opp_' if r['player']=='Opponent' else '')+k]) for k in FIELDS} for table, r in parser.rows
                  if table == 'team_and_opponent' and r.get('player') in ('Team', 'Opponent')
                  and (r.get('fga', '').isdigit() or r.get('opp_fga', '').isdigit())}
        pace_row = next(r for table, r in parser.rows if table == 'team_misc' and r.get('player') == 'Team')
        teams[team] = {'game': game_teams[team], 'season': totals['Team'], 'seasonOpponent': totals['Opponent'],
                       'seasonPace': float(pace_row['pace']), 'source': '實際'}
        for pid, p in tracking['players'].items():
            if p['team'] != team: continue
            regular = next((r for table, r in parser.rows if table == 'per_game_stats' and name(r.get('name_display', '')) == p['name']), None)
            advanced = next((r for table, r in parser.rows if table == 'advanced' and name(r.get('name_display', '')) == p['name']), None)
            game = next((r for t, r in box.rows if t == team and name(r.get('player', '')) == p['name']), None)
            bpm = float(advanced['bpm']) if advanced and advanced.get('bpm') else None
            players[pid] = {'game': counts(game) if game else None, 'season': counts(regular, True) if regular else None,
                            'usage': float(advanced['usg_pct']) if advanced and advanced.get('usg_pct') else 15,
                            'bpm': bpm if bpm is not None else 0, 'bpmSource': '實際' if bpm is not None else '估計',
                            'team': team, 'position': p['position']}
    values = [p['points'][p['team']] for p in possessions['possessions']]
    mean = sum(values)/len(values)
    variance = sum((v-mean)**2 for v in values)/len(values)
    return {'players': players, 'teams': teams, 'gameScoringVariance': variance,
            'gamePace': possessions['validation']['pace'],
            'sources': {'season': {t: f'https://www.basketball-reference.com/teams/{t}/2016.html' for t in teams},
                        'box': 'https://www.basketball-reference.com/boxscores/201512250GSW.html',
                        'bpmMethod': 'https://www.basketball-reference.com/about/bpm2.html',
                        'fourFactors': 'https://www.basketball-reference.com/about/factors.html'},
            'sha256': {**{t: hashlib.sha256(h.encode()).hexdigest() for t, h in season_html.items()},
                       'box': hashlib.sha256(box_html.encode()).hexdigest()}}


def main():
    parser = argparse.ArgumentParser(); parser.add_argument('--download', action='store_true'); args = parser.parse_args()
    if args.download:
        for t in ('CLE', 'GSW'):
            urllib.request.urlretrieve(f'https://www.basketball-reference.com/teams/{t}/2016.html', ROOT/f'data/raw/{t}-2016.html')
    tracking = json.loads((ROOT/'src/tracking-game.json').read_text())
    possessions = json.loads((ROOT/'src/possession-game.json').read_text())
    result = build(tracking, possessions, {t: (ROOT/f'data/raw/{t}-2016.html').read_text() for t in ('CLE', 'GSW')}, (ROOT/'data/raw/box.html').read_text())
    (ROOT/'src/model-data.json').write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':'))+'\n')
    print('Sourced season BPM:', sum(p['bpmSource']=='實際' for p in result['players'].values()), '/', len(result['players']))
    print('Game scoring variance:', round(result['gameScoringVariance'], 5))
    print('Season pace:', {t: d['seasonPace'] for t, d in result['teams'].items()})


if __name__ == '__main__': main()
