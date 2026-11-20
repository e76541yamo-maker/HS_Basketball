"""Run against a local key-enabled server; no secret is read by this client."""
import json
import urllib.request
from pathlib import Path

game = json.loads((Path(__file__).resolve().parents[1] / 'src/possession-game.json').read_text())
payload = {'facts': {'possessions': game['validation']['possessionCount'], 'finalScore': game['validation']['finalScore'],
                     'estimatedPlayTypes': True},
           'points': {'pro': ['以完整球隊進攻分布比較選擇，不把傳球當作新回合。'], 'con': ['小樣本與防守係數可能改變排序，不能推論因果。'],
                      'attack': ['對手可換防、沉退或夾擊；以防守層調整下一波風險。'], 'contingency': ['未得分先檢查籃板與換防；失誤後比較期望終場分差，而非只看勝率。']}}
request = urllib.request.Request('http://localhost:3000/api/analyze', data=json.dumps(payload).encode(), headers={'Content-Type': 'application/json'})
with urllib.request.urlopen(request, timeout=25) as response:
    print('HTTP', response.status)
    result = json.load(response)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    assert result['source'] == 'Claude', 'Expected live Claude, not the HTTP 200 rule fallback'
