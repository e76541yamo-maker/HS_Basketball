"""Run against a local key-enabled server; no secret is read by this client."""
import json
import urllib.request
from pathlib import Path

game = json.loads((Path(__file__).resolve().parents[1] / 'src/tracking-game.json').read_text())
d = game['distributions']['201939']
payload = {'facts': {'player': 'Stephen Curry', 'observedHolds': d['holds'], 'fga': d['fga'], 'fg': d['fg'],
                     'finalScore': game['meta']['validation']['finalScore']},
           'points': {'pro': ['轉移持球，讓隊友開始下一段選擇'], 'con': ['單場樣本有限，命中率已向球隊平均收縮'],
                      'attack': ['對手靠近可改變距離格，小樣本不能證明因果'], 'contingency': ['若傳球失誤，改看防守端補救分支。']}}
request = urllib.request.Request('http://localhost:3000/api/analyze', data=json.dumps(payload).encode(), headers={'Content-Type': 'application/json'})
with urllib.request.urlopen(request, timeout=25) as response:
    print('HTTP', response.status)
    result = json.load(response)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    assert result['source'] == 'Claude', 'Expected live Claude, not the HTTP 200 rule fallback'
