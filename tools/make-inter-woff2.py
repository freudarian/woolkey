"""Build assets/Inter-Variable.woff2 from the Inter variable TTF.

The shipped font is a Latin + Latin-Ext subset of the full family: 854 KB of
TTF becomes about 137 KB of woff2, with both variable axes (opsz 14–32,
wght 100–900) left intact so the 900-weight logo still comes out of the same
file. Requires `pip install fonttools brotli`, then:

    python tools/make-inter-woff2.py

The TTF stays in assets/ as the source but is never served — only the woff2
is referenced by css/main.css and precached by the service worker.
"""

import os
import pathlib

from fontTools import subset
from fontTools.ttLib import TTFont

ASSETS = pathlib.Path(__file__).resolve().parent.parent / "assets"
SRC = ASSETS / "Inter-VariableFont_opsz,wght.ttf"
OUT = ASSETS / "Inter-Variable.woff2"

# Google Fonts' latin + latin-ext ranges, plus the few symbols the UI uses
# (© in the footer, the arrows on the generate/copy buttons).
UNICODES = (
    "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,"
    "U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2190-2199,U+21BA,"
    "U+2212,U+2215,U+2398,U+FEFF,U+FFFD,"
    "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,"
    "U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113"
)

subset.main([
    str(SRC),
    f"--unicodes={UNICODES}",
    "--flavor=woff2",
    "--layout-features=+kern,+liga,+calt,+ccmp,+locl,+mark,+mkmk,+tnum",
    "--no-hinting",
    "--desubroutinize",
    f"--output-file={OUT}",
])

f = TTFont(OUT)
print("axes kept:", [(a.axisTag, a.minValue, a.maxValue) for a in f["fvar"].axes])
print("glyphs:  ", f["maxp"].numGlyphs)
print(f"{OUT.name}: {os.path.getsize(OUT) / 1024:.0f} KB "
      f"(from {os.path.getsize(SRC) / 1024:.0f} KB TTF)")
