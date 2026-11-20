"""Refresh Basketball Reference team season tables using the standard library."""
import json
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent

class Tables(HTMLParser):
    def __init__(self):
        super().__init__(); self.tables = {}; self.table = None; self.row = None; self.key = None
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'table':
            self.table = a.get('id'); self.tables[self.table] = []
        if tag == 'tr': self.row = {}
        if tag in ('td', 'th'):
            self.key = a.get('data-stat')
            if self.row is not None and self.key: self.row[self.key] = ''
    def handle_data(self, data):
        if self.row is not None and self.key: self.row[self.key] += data
    def handle_endtag(self, tag):
        if tag in ('td', 'th'): self.key = None
        if tag == 'tr' and self.table and self.row: self.tables[self.table].append(self.row); self.row = None
        if tag == 'table': self.table = None

def main():
    teams = {}
    for team in ('LAL', 'SAC'):
        url = f'https://www.basketball-reference.com/teams/{team}/2002.html'
        cached = ROOT / f'{team.lower()}-source.html'
        html = cached.read_text() if cached.exists() else urllib.request.urlopen(url, timeout=30).read().decode()
        parser = Tables(); parser.feed(html.replace('<!--', '').replace('-->', ''))
        rows = parser.tables['per_game_stats']
        players = []
        for row in rows:
            name = row.get('name_display') or row.get('player')
            if not name or name == 'Team Totals' or not row.get('pts_per_g') or not row['pts_per_g'].replace('.', '').isdigit(): continue
            p = {'id': team + str(len(players)), 'name': name, 'source': '實際', 'season': '2001-02', 'url': url}
            for key in ('g', 'gs', 'mp_per_g', 'pts_per_g', 'trb_per_g', 'ast_per_g', 'stl_per_g', 'blk_per_g', 'tov_per_g', 'pf_per_g', 'fg_pct', 'fg3_pct', 'ft_pct', 'orb_per_g'):
                source_key = {'g': 'games', 'gs': 'games_started'}.get(key, key)
                p[key] = float(row[source_key]) if row.get(source_key) else None
            players.append(p)
        teams[team] = players
    series_url = 'https://www.basketball-reference.com/playoffs/2002-nba-western-conference-finals-lakers-vs-kings.html'
    cached = ROOT / 'wcf-source.html'
    html = cached.read_text() if cached.exists() else urllib.request.urlopen(series_url, timeout=30).read().decode()
    series = Tables(); series.feed(html.replace('<!--', '').replace('-->', ''))
    for ps in teams.values():
        for p in ps:
            for rows in series.tables.values():
                for row in rows:
                    if row.get('player') == p['name'] and row.get('pts_per_g'):
                        p['wcf'] = {k: float(row[k]) for k in ('g', 'pts_per_g', 'trb_per_g', 'ast_per_g') if row.get(k)}
                        p['wcf_url'] = 'https://www.basketball-reference.com/playoffs/2002-nba-western-conference-finals-lakers-vs-kings.html'
    (ROOT / 'src/rosters.json').write_text(json.dumps(teams, ensure_ascii=False, indent=2) + '\n')
    print({t: len(p) for t,p in teams.items()})

if __name__ == '__main__': main()
