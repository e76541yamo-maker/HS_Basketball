import io
import json
import os
import socket
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

POINTS = {'pro': ['以完整球隊進攻分布比較選擇，不把傳球當作新回合。'], 'con': ['小樣本與防守係數可能改變排序，不能推論因果。'],
          'attack': ['對手可換防、沉退或夾擊；以防守層調整下一波風險。'], 'contingency': ['未得分先檢查籃板與換防；失誤後比較期望終場分差，而非只看勝率。']}
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

    def test_model_numbers_labels_and_percentages_remain_grounded(self):
        facts = {'models': ['四要素', '球員影響', '布朗運動', 'BPM'], 'ppp': '1.37', 'wp': '7.42%', 'leverage': '.63', 'bpm': '-1.4'}
        points = {**POINTS, 'pro': ['球員影響估計：期望1.37分，勝率7.42%，槓桿0.63。'], 'con': ['來源刊載 BPM -1.4；映射為估計。']}
        server.validated_points(points)
        server.validate_grounding(points, facts, POINTS)
        with self.assertRaises(ValueError): server.validate_grounding({'pro': ['期望9.99分']}, facts, POINTS)
        raw = json.dumps({'stop_reason': 'end_turn', 'content': [{'type': 'text', 'text': json.dumps(points)}]}).encode()
        with patch.dict(os.environ, {'ANTHROPIC_API_KEY': 'fixture-key'}), patch('server.urllib.request.urlopen', return_value=io.BytesIO(raw)):
            self.assertEqual(server.claude_analysis({'facts': facts, 'points': points})['source'], 'Claude')


class HTTPTest(unittest.TestCase):
    def test_incomplete_body_times_out(self):
        with patch.object(server.Handler, 'body_timeout', .05):
            with socket.create_connection(self.http.server_address, timeout=2) as client:
                client.sendall(b'POST /api/analyze HTTP/1.0\r\nContent-Type: application/json\r\nContent-Length: 10\r\n\r\n{')
                self.assertIn(b'400', client.recv(4096))

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
        for path in ('/src/segments.js', '/src/segment-view.js'):
            with urllib.request.urlopen(self.url + path) as response:
                self.assertEqual(response.status, 200)
        for path in ('/', '/src/engine.js', '/src/tracking-game.json', '/src/possession-game.json', '/src/model-data.json', '/src/evaluation-models.js', '/src/model-comparison.js', '/src/comparison-table.js', '/src/branch-tree.js', '/icons/noto-tc-400.ttf', '/api/ai-status'):
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
