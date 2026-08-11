"""Generate css/fireflies.css.

The firefly effect needs a different random path, orbit speed and blink
rhythm per insect. The CSP (style-src 'self') rules out handing those out
as inline styles at runtime, so they are baked into a stylesheet here
instead. Run from anywhere:

    python tools/gen-fireflies.py

Keep QUANTITY in sync with js/fireflies.js.
"""

import pathlib
import random

CSS_PATH = pathlib.Path(__file__).resolve().parent.parent / "css" / "fireflies.css"

random.seed(1806)  # fixed seed: regenerating this file gives the same swarm
QUANTITY = 15
out = []
w = out.append

w("""/* ==============================================================
   fireflies.css — decorative firefly swarm for the night scene.

   Loaded only by the pages that carry the sheep background
   (index, 404, offline). The whole layer is invisible in the light
   theme and cross-fades in with the night photo.

   Every keyframe below is pre-generated: the site CSP sets
   style-src 'self', so the per-firefly randomness cannot be handed
   out as inline style attributes at runtime the way the original
   Sass pen did. Regenerate rather than hand-edit — see
   assets/fireflies.txt for the source the effect came from.
   ============================================================== */

.fireflies {
  position: fixed;
  inset: 0;
  /* Between the photo layers (-2) and the page content, so the swarm drifts
     behind the glass and is seen through it. That does put 15 permanently
     animating elements inside the frosted panels' backdrop, which the
     compositor cannot cache — acceptable now that the card no longer
     changes width on every keystroke. pointer-events stays none. */
  z-index: -1;
  overflow: hidden;
  pointer-events: none;
  opacity: 0;
  transition: opacity 700ms ease;
}
:root[data-theme="dark"] .fireflies { opacity: 1; }

.firefly {
  position: absolute;
  left: 50%;
  top: 50%;
  width: clamp(2px, 0.4vw, 5px);
  height: clamp(2px, 0.4vw, 5px);
  /* The pseudo-elements orbit a point 10vw to their left, so the whole
     firefly is nudged 9.8vw right to keep that orbit centred. */
  margin: -0.2vw 0 0 9.8vw;
  animation: ease 200s alternate infinite;
  will-change: transform;
}

.firefly::before,
.firefly::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  transform-origin: -10vw;
}

/* The body of the insect — a dark speck that is only visible against
   the glow it casts. */
.firefly::before {
  background: #000;
  opacity: 0.4;
  animation: firefly-drift ease alternate infinite;
}

/* The lantern. Dark until flash() fires, then a brief warm burst. */
.firefly::after {
  background: #fff;
  opacity: 0;
  box-shadow: 0 0 0 0 #ffe066;
  animation: firefly-drift ease alternate infinite, firefly-flash ease infinite;
}

@keyframes firefly-drift {
  0%   { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

@keyframes firefly-flash {
  0%, 30%, 100% { opacity: 0; box-shadow: 0 0 0vw 0vw #ffe066; }
  5%            { opacity: 1; box-shadow: 0 0 2vw 0.4vw #ffe066; }
}

/* Pure decoration: nothing here conveys meaning, so it all goes away
   when the visitor asks for less motion. */
@media (prefers-reduced-motion: reduce) {
  .fireflies { display: none; }
}

/* ── Per-firefly randomisation ─────────────────────────────── */
""")

for i in range(1, QUANTITY + 1):
    steps = random.randint(16, 26)
    rot = random.randint(8, 18)
    flash_dur = random.randint(5000, 11000)
    flash_delay = random.randint(500, 8500)
    w(f".firefly:nth-child({i}) {{ animation-name: firefly-move-{i}; }}")
    w(f".firefly:nth-child({i})::before {{ animation-duration: {rot}s; }}")
    w(f".firefly:nth-child({i})::after {{")
    w(f"  animation-duration: {rot}s, {flash_dur}ms;")
    w(f"  animation-delay: 0ms, {flash_delay}ms;")
    w("}")
    w(f"@keyframes firefly-move-{i} {{")
    for step in range(steps + 1):
        pct = round(step * 100 / steps, 2)
        pct_s = f"{pct:g}"
        x = random.randint(-50, 50)
        y = random.randint(-50, 50)
        scale = round(random.randint(25, 100) / 100, 2)
        w(f"  {pct_s}% {{ transform: translateX({x}vw) translateY({y}vh) scale({scale:g}); }}")
    w("}")
    w("")

CSS_PATH.write_text("\n".join(out), encoding="utf-8", newline="\n")
print(f"wrote {CSS_PATH} ({CSS_PATH.stat().st_size / 1024:.0f} KB)")
