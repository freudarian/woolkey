"""Generate the PWA and Apple touch icons from assets/favicon.png.

favicon.png is the only hand-drawn icon source: 112x120 pixel art stored at
4x (448x480) with a transparent surround. Everything else is derived, so it
lives here rather than being redrawn:

    assets/icon-192.png        manifest, purpose any + maskable
    assets/icon-512.png        manifest, purpose any + maskable
    assets/apple-touch-icon.png  index.html <link rel="apple-touch-icon">

Requires Pillow. Run from anywhere:

    python -m pip install Pillow
    python tools/gen-icons.py

Two things drive the padding. The manifest declares these icons maskable, so
the art has to survive a platform mask that can crop to a circle; and Apple
composites onto black wherever the source is transparent, so nothing may be
left see-through. Both are handled by matting the art onto an opaque
BACKGROUND square with room to spare.

Each icon is rendered from a 1024px master whose art is an exact integer
multiple of the 112x120 source grid — nearest-neighbour, so the pixel blocks
stay square and even — and only then resampled down. Scaling straight to
192px would land on a fractional block size and give the sheep uneven pixels.
"""

import pathlib

from PIL import Image

ASSETS = pathlib.Path(__file__).resolve().parent.parent / "assets"
SOURCE = ASSETS / "favicon.png"

BACKGROUND = (15, 17, 23, 255)  # #0f1117, matches manifest background_color
MASTER = 1024
GRID_W, GRID_H = 112, 120  # native pixel-art grid inside favicon.png

# Art height as a share of the icon, expressed as a source-grid multiple at
# MASTER size. 6 -> 720px of 1024 (70%): comfortably inside the maskable safe
# zone, which only guarantees a circle 80% of the icon across. 7 -> 840px
# (82%): iOS just rounds the corners, so the art can sit tighter.
MASKABLE_SCALE = 6
APPLE_SCALE = 7

# (filename, size, master scale)
ICONS = [
    ("icon-192.png", 192, MASKABLE_SCALE),
    ("icon-512.png", 512, MASKABLE_SCALE),
    ("apple-touch-icon.png", 180, APPLE_SCALE),
]


def master(art, scale):
    """Matte the art onto an opaque MASTER-sized square at the given scale."""
    art = art.resize((GRID_W * scale, GRID_H * scale), Image.NEAREST)
    canvas = Image.new("RGBA", (MASTER, MASTER), BACKGROUND)
    canvas.alpha_composite(
        art, ((MASTER - art.width) // 2, (MASTER - art.height) // 2)
    )
    return canvas


def main():
    source = Image.open(SOURCE).convert("RGBA")
    # Down to the native grid first: favicon.png is that grid at 4x, so this
    # is lossless and lets the masters scale by a clean integer.
    art = source.resize((GRID_W, GRID_H), Image.NEAREST)

    for name, size, scale in ICONS:
        icon = master(art, scale).resize((size, size), Image.LANCZOS)
        # No alpha channel: maskable icons and iOS both want it fully opaque.
        icon.convert("RGB").save(ASSETS / name, "PNG", optimize=True)
        print(f"wrote {name} ({size}x{size})")


if __name__ == "__main__":
    main()
