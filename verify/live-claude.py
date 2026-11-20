"""Run against a local key-enabled server; no secret is read by this client."""
import json
import os
import subprocess
import urllib.request
from pathlib import Path

root = Path(__file__).resolve().parents[1]
script = """import {analyze} from './src/manager-options.js';import {momentState} from './src/scenarios.js';import {options,play} from './src/engine.js';
const s=play({...momentState('key3'),coach:{team:'CLE'}},{action:'spotup',clock:'quickThree'});
const a=analyze(s,{action:options(s)[0].id});
const comparison=a.comparisonFacts.map(row=>({...row,models:row.models.filter(m=>m.selected)}));
console.log(JSON.stringify({facts:{facts:a.facts,comparison},points:{pro:a.pro,con:a.con,attack:a.attack,contingency:a.contingency}}));"""
payload = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', script], cwd=root))
assert any(f['label'] == '本隊（CLE）先驗後勝率' and f['value'] == '10.50%' for f in payload['facts']['facts'])
assert all(row['managedTeam'] == 'CLE' for row in payload['facts']['comparison'])
request = urllib.request.Request(os.environ.get('COURTSIDE_URL', 'http://localhost:3000')+'/api/analyze', data=json.dumps(payload).encode(), headers={'Content-Type': 'application/json'})
with urllib.request.urlopen(request, timeout=25) as response:
    print('HTTP', response.status)
    result = json.load(response)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    assert result['source'] == 'Claude', 'Expected live Claude, not the HTTP 200 rule fallback'
    assert all('；若' in point and '｜' in point for card in result['points'].values() for point in card)
    print('LIVE CLAUDE POSSESSION PASS: CLE 10.50% after GSW takes possession')
