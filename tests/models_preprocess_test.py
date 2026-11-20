import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from preprocess_models import Tables, counts, name, build


class ModelsPreprocessTest(unittest.TestCase):
    def test_table_nested_text_and_name_normalization(self):
        p = Tables(); p.feed('<table id="advanced"><tr><td data-stat="name_display"><a>Anderson Varejão*</a></td><td data-stat="bpm">-1.9</td></tr></table>')
        self.assertEqual(p.rows, [('advanced', {'name_display': 'Anderson Varejão*', 'bpm': '-1.9'})])
        self.assertEqual(name(p.rows[0][1]['name_display']), 'Anderson Varejao')
        self.assertEqual(Tables().rows, [])

    def test_missing_source_is_rejected_and_counts_are_not_invented(self):
        with self.assertRaises(ValueError): build({'players': {}}, {}, {}, '')
        with self.assertRaises(KeyError): counts({})
        row = {k: '2' for k in ('fg', 'fg3', 'fga', 'ft', 'fta', 'orb', 'drb', 'tov')}; row['mp'] = '12:30'
        self.assertEqual(counts(row)['minutes'], 12.5)

    def test_committed_inputs_reconcile_independent_box_and_source_status(self):
        data = json.loads((ROOT/'src/model-data.json').read_text())
        self.assertEqual(len(data['players']), 26)
        for team in ('CLE', 'GSW'):
            for key in ('fg', 'fg3', 'fga', 'ft', 'fta', 'orb', 'drb', 'tov'):
                self.assertEqual(sum((p['game'] or {}).get(key, 0) for p in data['players'].values() if p['team']==team), data['teams'][team]['game'][key])
            self.assertEqual(len(data['sha256'][team]), 64)
            self.assertIn('/2016.html', data['sources']['season'][team])
        self.assertEqual(data['players']['201939']['bpm'], 11.9)
        self.assertTrue(all(p['bpmSource']=='實際' for p in data['players'].values()))


if __name__ == '__main__': unittest.main()
