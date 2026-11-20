import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent


def ui_characters():
    paths = [ROOT / 'index.html', *ROOT.glob('src/*.js'), *ROOT.glob('src/*.css')]
    text = ''.join(path.read_text(encoding='utf-8') for path in paths)
    roster = json.loads((ROOT / 'src/rosters.json').read_text(encoding='utf-8'))
    text += json.dumps(roster, ensure_ascii=False)
    text += '零〇一二兩三四五六七八九十百千萬點成分厘百分之'
    return {ord(c) for c in text if not c.isspace()} | set(range(32, 127))
