#!/usr/bin/env python3
"""Phase 14: tiny font files holding only the Naira sign (₦) and the Hausa hooked letters
(Ɓ ɓ Ɗ ɗ Ƙ ƙ Ƴ ƴ). Without them, any page showing a price downloads the whole "latin-ext" fonts
(about 165 KB) on phones. Re-run only if the font files change:  python3 scripts/font-subset.py
Needs: pip install fonttools brotli
"""
import os
from fontTools import subset

HERE = os.path.join(os.path.dirname(__file__), '..', 'plugins', 'explore-katsina-core', 'assets', 'fonts')
CODEPOINTS = [0x20A6, 0x0181, 0x0253, 0x018A, 0x0257, 0x0198, 0x0199, 0x01B3, 0x01B4]

for name in ('overpass', 'unbounded'):
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = ['*']
    opts.name_IDs = ['*']
    opts.notdef_outline = True
    font = subset.load_font(os.path.join(HERE, f'{name}-latin-ext.woff2'), opts)
    s = subset.Subsetter(opts)
    s.populate(unicodes=CODEPOINTS)
    s.subset(font)
    out = os.path.join(HERE, f'{name}-naira-hausa.woff2')
    subset.save_font(font, out, opts)
    print(out, os.path.getsize(out), 'bytes')
