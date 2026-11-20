"""Regenerate: python3 subset_fonts.py NotoSansTC[wght].ttf DejaVuSans.ttf.

Requires fonttools. Full font: https://github.com/google/fonts/tree/main/ofl/notosanstc
Two arrow glyphs come from DejaVu Sans (https://dejavu-fonts.github.io/).
Licenses are retained in icons/OFL.txt and icons/DejaVu-LICENSE.txt.
"""
import hashlib
import re
import sys
from pathlib import Path

from fontTools import subset
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from ui_characters import ui_characters


ROOT = Path(__file__).resolve().parent


def main(source, symbols_source):
    characters = ui_characters()
    symbols = TTFont(symbols_source)
    for weight in (400, 600):
        font = instantiateVariableFont(TTFont(source), {'wght': weight}, inplace=True)
        missing = characters - font.getBestCmap().keys()
        for code in sorted(missing):
            name = symbols.getBestCmap()[code]
            glyphs = symbols.getGlyphSet()
            recording = DecomposingRecordingPen(glyphs)
            glyphs[name].draw(recording)
            pen = TTGlyphPen(None)
            scale = font['head'].unitsPerEm / symbols['head'].unitsPerEm
            recording.replay(TransformPen(pen, (scale, 0, 0, scale, 0, 0)))
            name = f'uiSymbol{code:X}'
            font.setGlyphOrder([*font.getGlyphOrder(), name])
            font['glyf'][name] = pen.glyph()
            font['hmtx'][name] = (round(glyphs[symbols.getBestCmap()[code]].width * scale), 0)
            if 'vmtx' in font:
                font['vmtx'][name] = (font['head'].unitsPerEm, 0)
            for table in font['cmap'].tables:
                if table.isUnicode():
                    table.cmap[code] = name
        subsetter = subset.Subsetter()
        subsetter.populate(unicodes=characters)
        subsetter.subset(font)
        destination = ROOT / f'icons/noto-tc-{weight}.ttf'
        font.save(destination)
        digest = hashlib.sha256(destination.read_bytes()).hexdigest()[:12]
        stylesheet = ROOT / 'src/fonts.css'
        stylesheet.write_text(re.sub(
            rf'/icons/{re.escape(destination.name)}(?:\?v=[a-f0-9]+)?',
            f'/icons/{destination.name}?v={digest}',
            stylesheet.read_text(encoding='utf-8'),
        ), encoding='utf-8')
        print(f'{destination.name}: {len(characters)} codepoints')


if __name__ == '__main__':
    main(*sys.argv[1:])
