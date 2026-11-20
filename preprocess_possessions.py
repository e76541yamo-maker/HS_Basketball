"""Derive team possessions and dead-ball manager windows from the ordered NBA PBP.

Run after preprocess_tracking.py; no network or third-party packages required.
"""
from collections import Counter
from copy import deepcopy
import csv
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import unicodedata

from preprocess_tracking import Box

ROOT = Path(__file__).resolve().parent
TEAMS = ('CLE', 'GSW')
DEAD = {1: '進球', 6: '犯規', 7: '違例', 8: '換人窗口', 9: '暫停', 12: '節次開始'}


def seconds(value):
    m, s = value.split(':')
    return int(m)*60+float(s)


class Season(HTMLParser):
    def __init__(self):
        super().__init__(); self.table = ''; self.rows = []; self.row = {}; self.key = None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'table': self.table = a.get('id', '')
        if tag == 'tr': self.row = {}
        if tag in ('th', 'td'):
            self.key = a.get('data-stat'); self.row[self.key] = ''

    def handle_data(self, data):
        if self.key: self.row[self.key] += data

    def handle_endtag(self, tag):
        if tag in ('th', 'td'): self.key = None
        if tag == 'tr' and self.table in ('per_game_stats', 'advanced') and self.row.get('name_display'):
            self.rows.append((self.table, self.row))
        if tag == 'table': self.table = ''


def build(rows, tracking, box_totals=None):
    if not rows or any(r['GAME_ID'] != '0021500438' for r in rows):
        raise ValueError('Expected nonempty PBP for 0021500438')
    players = tracking['players']
    score = dict.fromkeys(TEAMS, 0)
    resources = {'teamFouls': dict.fromkeys(TEAMS, 0), 'lateFouls': dict.fromkeys(TEAMS, 0),
                 'timeouts': dict.fromkeys(TEAMS, 8), 'personalFouls': dict.fromkeys(players, 0), 'lineups': {}}
    possessions = []; active = None; period = 0; next_clock = 720; next_reason = ['節次開始']
    rebound_pending = False

    def snap(clock):
        return dict(quarter=period, clock=clock, score=deepcopy(score), **deepcopy(resources))

    def future_team(i):
        for r in rows[i:]:
            if int(r['PERIOD']) != period: break
            if int(r['EVENTMSGTYPE']) in (1, 2, 3, 5):
                return r['PLAYER1_TEAM_ABBREVIATION']
            if int(r['EVENTMSGTYPE']) == 10:
                t = r['PLAYER3_TEAM_ABBREVIATION']
                if t in TEAMS: return t
        return None

    def close(clock, outcome):
        nonlocal active, next_clock, next_reason, rebound_pending
        active['end'] = snap(clock); active['outcome'] = outcome
        active['points'] = {t: score[t]-active['start']['score'][t] for t in TEAMS}
        active['id'] = len(possessions)
        possessions.append(active)
        next_clock = clock
        next_reason = ['進球'] if outcome == 'made' else ['罰球結束'] if outcome == 'freeThrows' else []
        active = None; rebound_pending = False

    for i, row in enumerate(rows):
        q = int(row['PERIOD']); clock = seconds(row['PCTIMESTRING']); kind = int(row['EVENTMSGTYPE'])
        pid = row['PLAYER1_ID']
        team = row['PLAYER1_TEAM_ABBREVIATION'] or {'1610612739': 'CLE', '1610612744': 'GSW'}.get(pid, '')
        description = ' / '.join(s for s in (row['HOMEDESCRIPTION'], row['VISITORDESCRIPTION'], row['NEUTRALDESCRIPTION']) if s)
        if q != period:
            if active: raise ValueError('Unclosed period')
            period = q; next_clock = 720 if q <= 4 else 300; next_reason = ['節次開始']
            resources['teamFouls'] = dict.fromkeys(TEAMS, 0); resources['lateFouls'] = dict.fromkeys(TEAMS, 0)
            h = next(h for h in tracking['holds'] if h['q'] == q)
            resources['lineups'] = {t: [str(p[0]) for p in h['positions'] if players[str(p[0])]['team'] == t] for t in TEAMS}
        if active is None:
            offense = future_team(i)
            if offense is None and kind == 13 and next_clock > 0 and possessions and possessions[-1]['end']['quarter'] == period:
                offense = 'GSW' if possessions[-1]['team'] == 'CLE' else 'CLE'
            if offense is None: continue
            active = {'team': offense, 'start': snap(next_clock), 'events': [], 'windows': [],
                      'startReasons': next_reason, 'offensiveRebounds': 0}
        event = {'id': int(row['EVENTNUM']), 'kind': kind, 'clock': clock, 'team': team,
                 'player': pid, 'description': description}
        active['events'].append(event)
        if row['SCORE']:
            cle, gsw = map(int, row['SCORE'].split(' - ')); score = {'CLE': cle, 'GSW': gsw}
        if kind == 6:
            personal = re.search(r'\(P(\d+)', description)
            if personal and pid in players: resources['personalFouls'][pid] = int(personal[1])
            if team in TEAMS and int(row['EVENTMSGACTIONTYPE']) in (1, 2, 3, 5, 6):
                resources['teamFouls'][team] += 1
                if clock <= 120: resources['lateFouls'][team] += 1
        if kind == 9 and row['EVENTMSGACTIONTYPE'] in ('1', '2'):
            t = {'1610612739': 'CLE', '1610612744': 'GSW'}.get(pid)
            if t: resources['timeouts'][t] = max(0, resources['timeouts'][t]-1)
        if kind == 8 and team in TEAMS:
            lineup = resources['lineups'][team]; incoming = row['PLAYER2_ID']
            if pid not in lineup: raise ValueError(f'Substitution mismatch {row["EVENTNUM"]}: {lineup}')
            lineup[lineup.index(pid)] = incoming
        if kind in DEAD:
            active['windows'].append({'offset': len(active['events']), 'reason': DEAD[kind], 'state': snap(clock)})
        if kind == 2:
            rebound_pending = True
        if kind == 1:
            # A made field goal and its same-clock and-one belong to one possession.
            and_one = False
            for following in rows[i+1:]:
                if following['PERIOD'] != row['PERIOD'] or following['PCTIMESTRING'] != row['PCTIMESTRING']: break
                if following['EVENTMSGTYPE'] == '3' and following['EVENTMSGACTIONTYPE'] == '10' and following['PLAYER1_TEAM_ABBREVIATION'] == team:
                    and_one = True
            if not and_one: close(clock, 'made')
        elif kind == 3 and row['EVENTMSGACTIONTYPE'] != '16':
            rebound_pending = False
            attempt = re.search(r'(\d) of (\d)', description)
            if attempt and attempt[1] == attempt[2]:
                if 'MISS' not in description: close(clock, 'freeThrows')
                else: rebound_pending = True
        elif kind == 4 and rebound_pending and team in TEAMS:
            if team != active['team']: close(clock, 'defensiveRebound')
            else:
                active['offensiveRebounds'] += 1; rebound_pending = False
        elif kind == 5:
            close(clock, 'turnover')
        elif kind == 13:
            close(clock, 'periodEnd')
    if active: raise ValueError('Unclosed final possession')
    windows = []
    for p in possessions:
        p['holds'] = [i for i, h in enumerate(tracking['holds']) if h['q'] == p['start']['quarter'] and h['team'] == p['team'] and p['end']['clock'] <= h['clock'] <= p['start']['clock']]
        shots = [e for e in p['events'] if e['kind'] in (1, 2)]
        description = shots[-1]['description'] if shots else ''
        # Descriptions identify shot style, not Synergy play type. This proxy is estimated.
        p['playType'] = 'transition' if 'Fast Break' in description else 'post' if 'Hook' in description else 'isolation' if 'Driving' in description or 'Fadeaway' in description else 'spotup'
        p['description'] = description or next((e['description'] for e in reversed(p['events']) if e['description']), '節次結束')
        base = {'possessionIndex': p['id'], 'offset': 0, 'state': p['start'], 'reasons': p['startReasons'],
                'decision': bool(p['startReasons']) or p['start']['quarter'] >= 4 and p['start']['clock'] <= 300}
        windows.append(base)
        grouped = {}
        for w in p['windows']:
            # An end-of-possession dead ball opens the *next* possession's window.
            if w['offset'] >= len(p['events']) or (p['outcome'] == 'turnover' and w['state']['clock'] == p['end']['clock']):
                if p['id']+1 < len(possessions):
                    possessions[p['id']+1]['startReasons'].append(w['reason'])
                continue
            key = w['state']['clock']
            old = grouped.get(key)
            grouped[key] = {'possessionIndex': p['id'], 'offset': w['offset'], 'state': w['state'],
                            'reasons': (old['reasons'] if old else [])+[w['reason']], 'decision': True}
        # Group simultaneous timeout/substitution/foul events as one manager window.
        for w in grouped.values():
            if w['state']['clock'] == base['state']['clock']:
                base['state'] = w['state']; base['offset'] = w['offset']; base['reasons'] += w['reasons']; base['decision'] = True
            else: windows.append(w)
    counts = Counter(p['team'] for p in possessions)
    # Independent box-score possession estimate: FGA + .44 FTA - ORB + TOV.
    box_pace = sum(r['fga']+.44*r['fta']-r['orb']+r['tov'] for r in box_totals.values())/2 if box_totals else None
    return {'possessions': possessions, 'windows': windows, 'validation': {
        'possessionCount': len(possessions), 'byTeam': dict(counts), 'pace': len(possessions)/2,
        'boxPossessionEstimate': round(box_pace, 2) if box_pace else None, 'boxTotals': box_totals, 'finalScore': score, 'scoreMatch': score == {'CLE': 83, 'GSW': 89},
        'offensiveRebounds': sum(p['offensiveRebounds'] for p in possessions),
        'playerOffensiveRebounds': sum(e['kind']==4 and e['player'] in players and e['team']==p['team'] and 'Off:' in e['description'] for p in possessions for e in p['events']),
        'decisionWindows': sum(w['decision'] for w in windows)}}


def main():
    tracking = json.loads((ROOT/'src/tracking-game.json').read_text())
    rows = list(csv.DictReader((ROOT/'data/raw/pbp.csv').read_text().splitlines()))
    box = Box(); box.feed((ROOT/'data/raw/box.html').read_text().replace('<!--', '').replace('-->', ''))
    totals = {t: {k: int(r[k]) for k in ('fga', 'fta', 'orb', 'tov')} for t, r in box.rows if r.get('player') == 'Team Totals'}
    if set(totals) != set(TEAMS): raise ValueError('Missing independent box team totals')
    game = build(rows, tracking, totals)
    seasons = {}
    for team in TEAMS:
        parser = Season(); parser.feed((ROOT/f'data/raw/{team}-2016.html').read_text().replace('<!--', '').replace('-->', ''))
        for pid, player in tracking['players'].items():
            if player['team'] != team: continue
            stats = {}
            for table, row in parser.rows:
                name = ''.join(c for c in unicodedata.normalize('NFD', row['name_display'].replace('*', '').strip()) if not unicodedata.combining(c))
                if name != player['name']: continue
                for key in ('mp_per_g', 'pts_per_g', 'fga_per_g', 'fta_per_g', 'tov_per_g', 'fg_pct', 'ft_pct', 'ts_pct', 'usg_pct'):
                    if row.get(key): stats[key] = float(row[key])
            seasons[pid] = stats
    game['seasonStats'] = seasons
    game['sources'] = {'pbp': 'https://raw.githubusercontent.com/sealneaward/nba-movement-data/master/data/events/0021500438.csv',
                       'season': ['https://www.basketball-reference.com/teams/'+t+'/2016.html' for t in TEAMS],
                       'playTypes': '估計：NBA stats synergyplaytypes request timed out; public page supplies no fetched historical table. League-typical illustrative priors, not measured 2015–16 team rates.'}
    (ROOT/'src/possession-game.json').write_text(json.dumps(game, ensure_ascii=False, separators=(',', ':')))
    print(json.dumps(game['validation'], ensure_ascii=False, indent=2))
    print('Season player matches:', sum(bool(s) for s in seasons.values()), '/', len(seasons))


if __name__ == '__main__': main()
