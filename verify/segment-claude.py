"""Verify sourced segment facts through a locally key-enabled Claude server."""
import json
import os
from pathlib import Path
import subprocess
import urllib.request

root = Path(__file__).resolve().parents[1]
script = """import {segmentState,segmentAnalysis} from './src/segments.js';
const s=segmentState();s.valueModel='impact';s.wpModel='brownian';
const a=segmentAnalysis(s);console.log(JSON.stringify({facts:{facts:a.facts},points:{pro:a.pro,con:a.con,attack:a.attack,contingency:a.contingency}}));"""
payload = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', script], cwd=root))
request = urllib.request.Request(os.environ.get('COURTSIDE_URL', 'http://localhost:3108')+'/api/analyze', data=json.dumps(payload).encode(), headers={'Content-Type': 'application/json'})
with urllib.request.urlopen(request, timeout=60) as response:
    result = json.load(response)
    print('HTTP', response.status)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    assert result['source'] == 'Claude', 'HTTP 200 fallback is not live Claude'
