"""Run against a local key-enabled server; no secret is read by this client."""
import json
import urllib.request

payload = {'facts': {'quarter': 4, 'clock': 720, 'score': {'LAL': 75, 'SAC': 75}},
           'points': {'pro': ['年度資料作為能力起點'], 'con': ['年度平均並非這次對位的保證'],
                      'attack': ['對手可用換防或包夾改變出手條件'], 'contingency': ['若體力下降，可暫停或換上板凳。']}}
request = urllib.request.Request('http://localhost:3000/api/analyze', data=json.dumps(payload).encode(), headers={'Content-Type': 'application/json'})
with urllib.request.urlopen(request, timeout=25) as response:
    print('HTTP', response.status)
    result = json.load(response)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    assert result['source'] == 'Claude', 'Expected live Claude, not the HTTP 200 rule fallback'
