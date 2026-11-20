import hashlib
import struct
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from ui_characters import ui_characters


def font_characters(path):
    data = path.read_bytes()
    u16 = lambda offset: struct.unpack_from('>H', data, offset)[0]
    u32 = lambda offset: struct.unpack_from('>I', data, offset)[0]
    tables = {data[i:i + 4]: u32(i + 8) for i in range(12, 12 + 16 * u16(4), 16)}
    cmap = tables[b'cmap']
    characters = set()
    for i in range(cmap + 4, cmap + 4 + 8 * u16(cmap + 2), 8):
        platform, encoding = u16(i), u16(i + 2)
        if platform != 0 and (platform != 3 or encoding not in (1, 10)):
            continue
        offset = cmap + u32(i + 4)
        if u16(offset) == 12:
            for j in range(offset + 16, offset + 16 + 12 * u32(offset + 12), 12):
                start, end, glyph = struct.unpack_from('>III', data, j)
                characters.update(range(start + (glyph == 0), end + 1))
        elif u16(offset) == 4:
            count = u16(offset + 6) // 2
            ends = offset + 14
            starts = ends + 2 * count + 2
            deltas = starts + 2 * count
            ranges = deltas + 2 * count
            for j in range(count):
                delta, shift = u16(deltas + 2 * j), u16(ranges + 2 * j)
                for code in range(u16(starts + 2 * j), u16(ends + 2 * j) + 1):
                    glyph = u16(ranges + 2 * j + shift + 2 * (code - u16(starts + 2 * j))) if shift else code
                    if glyph and (glyph + delta) % 65536:
                        characters.add(code)
    return characters


class FontCoverageTest(unittest.TestCase):
    def test_font_urls_change_with_bundled_content(self):
        stylesheet = (ROOT / 'src/fonts.css').read_text(encoding='utf-8')
        for weight in (400, 600):
            with self.subTest(weight=weight):
                name = f'noto-tc-{weight}.ttf'
                digest = hashlib.sha256((ROOT / 'icons' / name).read_bytes()).hexdigest()[:12]
                self.assertIn(f"url('/icons/{name}?v={digest}')", stylesheet)

    def test_tracking_players_are_in_the_ui_character_set(self):
        self.assertTrue({ord(c) for c in 'LeBron James Stephen Curry Anderson Varejao'} <= ui_characters())

    def test_bundled_weights_cover_ui_source(self):
        for weight in (400, 600):
            with self.subTest(weight=weight):
                missing = ui_characters() - font_characters(ROOT / f'icons/noto-tc-{weight}.ttf')
                self.assertFalse(missing, 'Missing glyphs: ' + ' '.join(f'U+{c:04X} {chr(c)}' for c in sorted(missing)))


if __name__ == '__main__':
    unittest.main()
