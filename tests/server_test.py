import io
import json
import os
from pathlib import Path
import sys
import threading
import unittest
import urllib.error
import urllib.request
from unittest.mock import patch
from http.server import ThreadingHTTPServer

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import server

POINTS = {'pro': ['轉移持球，讓隊友開始下一段選擇'], 'con': ['單場樣本有限，命中率已向球隊平均收縮'],
          'attack': ['對手靠近可改變距離格，小樣本不能證明因果'], 'contingency': ['若傳球失誤，改看防守端補救分支。']}
PAYLOAD = {'facts': {'score': {'CLE': 83, 'GSW': 89}, 'rate': .469}, 'points': POINTS}


class AnalysisTest(unittest.TestCase):
    def test_no_key_and_upstream_failure_fallback(self):
        with patch.dict(os.environ, {}, clear=True):
            result = server.claude_analysis(PAYLOAD)
        self.assertEqual(result['source'], '規則引擎')
        self.assertEqual(result['points'], POINTS)
        with patch.dict(os.environ, {'ANTHROPIC_API_KEY': 'fixture-key'}), patch('server.urllib.request.urlopen', side_effect=OSError):
            self.assertEqual(server.claude_analysis(PAYLOAD)['source'], '規則引擎')

    def test_grounding_and_card_errors(self):
        for bad in ({}, {**POINTS, 'pro': []}, {**POINTS, 'con': ['999 分']*4}, {**POINTS, 'pro': ['\n']}, {**POINTS, 'pro': ['😀']}):
            with self.assertRaises(ValueError): server.validated_points(bad)
        for text in ('999 分', '九十九分', '百分之九十九', '99%', '八個', '九十九籃板', '表currency'):
            with self.assertRaises(ValueError): server.validate_grounding({'pro': [text]}, PAYLOAD['facts'], POINTS)
        server.validate_grounding({'pro': ['46.9%']}, PAYLOAD['facts'], POINTS)
        self.assertEqual(server.numbers_in('七十五分'), {75})

    def test_structured_upstream_and_secret_suppression(self):
        captured = []
        def upstream(request, timeout):
            captured.append(json.loads(request.data))
            return io.BytesIO(json.dumps({'stop_reason': 'end_turn', 'content': [{'type': 'text', 'text': json.dumps(POINTS)}]}).encode())
        with patch.dict(os.environ, {'ANTHROPIC_API_KEY': 'fixture-key'}), patch('server.urllib.request.urlopen', side_effect=upstream):
            self.assertEqual(server.claude_analysis(PAYLOAD)['source'], 'Claude')
        self.assertNotIn('minItems": 2', json.dumps(captured))
        self.assertEqual(captured[0]['output_config']['format']['schema']['properties']['pro']['minItems'], 1)
        for response in [b'fixture-key', b'{}', json.dumps({'stop_reason': 'max_tokens'}).encode()]:
            with patch.dict(os.environ, {'ANTHROPIC_API_KEY': 'fixture-key'}), patch('server.urllib.request.urlopen', return_value=io.BytesIO(response)):
                result = server.claude_analysis(PAYLOAD)
                self.assertEqual(result['source'], '規則引擎')
                self.assertNotIn('fixture-key', json.dumps(result))
        bad = {**POINTS, 'pro': ['999 分']}
        raw = json.dumps({'stop_reason': 'end_turn', 'content': [{'type': 'text', 'text': json.dumps(bad)}]}).encode()
        with patch.dict(os.environ, {'ANTHROPIC_API_KEY': 'fixture-key'}), patch('server.urllib.request.urlopen', return_value=io.BytesIO(raw)):
            self.assertEqual(server.claude_analysis(PAYLOAD)['source'], '規則引擎')


class HTTPTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.http = ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        cls.thread = threading.Thread(target=cls.http.serve_forever, daemon=True)
        cls.thread.start()
        cls.url = f'http://127.0.0.1:{cls.http.server_port}'

    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown(); cls.http.server_close(); cls.thread.join()

    def test_static_allowlist_and_status(self):
        for path in ('/', '/src/engine.js', '/src/tracking-game.json', '/src/branch-tree.js', '/icons/noto-tc-400.ttf', '/api/ai-status'):
            with urllib.request.urlopen(self.url + path) as response:
                self.assertEqual(response.status, 200)
                self.assertEqual(response.headers['X-Content-Type-Options'], 'nosniff')
                response.read()
        for path in ('/server.py', '/.git/config', '/%2e%2e/server.py', '/tests/server_test.py'):
            with self.assertRaises(urllib.error.HTTPError) as error: urllib.request.urlopen(self.url + path)
            self.assertEqual(error.exception.code, 404)

    def test_post_fallback_and_errors(self):
        with patch.dict(os.environ, {}, clear=True):
            request = urllib.request.Request(self.url+'/api/analyze', data=json.dumps(PAYLOAD).encode(), headers={'Content-Type': 'application/json'})
            with urllib.request.urlopen(request) as response:
                self.assertEqual(response.status, 200)
                self.assertEqual(json.load(response)['source'], '規則引擎')
        for data, origin, expected in [(b'{', None, 400), (b'{}', 'https://untrusted.example', 403), (b'', None, 400)]:
            headers = {'Content-Type': 'application/json'}
            if origin: headers['Origin'] = origin
            with self.assertRaises(urllib.error.HTTPError) as error:
                urllib.request.urlopen(urllib.request.Request(self.url+'/api/analyze', data=data, headers=headers))
            self.assertEqual(error.exception.code, expected)


if __name__ == '__main__': unittest.main()
