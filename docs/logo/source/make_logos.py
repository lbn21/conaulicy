"""Generates the three "ul." plate logo variants as SVG (paths only).

Glyphs: Atkinson Hyperlegible Next Bold, shaped with HarfBuzz (kern on),
then optical kerning per pair, outlined with fontTools. No fonts embedded.
"""
import os
import sys

import uharfbuzz as hb
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

FONT = os.path.join(os.path.dirname(__file__), "../../../web/assets/fonts/AtkinsonHyperlegibleNext-Bold.ttf")
OUT = sys.argv[1] if len(sys.argv) > 1 else "out"
os.makedirs(OUT, exist_ok=True)

tt = TTFont(FONT)
glyphset = tt.getGlyphSet()
UPM = tt["head"].unitsPerEm
XH = tt["OS/2"].sxHeight / UPM  # 0.496
blob = hb.Blob.from_file_path(FONT)
hbfont = hb.Font(hb.Face(blob))

AMBER = {"dark": "#FFB547", "light": "#9A5700"}
INK = {"dark": "#E9EDF2", "light": "#161B24"}
BG = {"dark": "#10141D", "light": "#F5F7FA"}


def fmt(v):
    s = f"{v:.2f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


def text_path(s, size, x, baseline, kern=None, track=0.0):
    """Outline s at size px; x = left edge of the first glyph's ink.

    kern: {i: units} extra space after glyph i (optical kerning, units/1000).
    Returns (d, ink_left, ink_right).
    """
    kern = kern or {}
    buf = hb.Buffer()
    buf.add_str(s)
    buf.guess_segment_properties()
    hb.shape(hbfont, buf, {"kern": True, "liga": False})
    scale = size / UPM
    pen_x = 0.0
    parts = []
    glyphs = []
    for i, (info, pos) in enumerate(zip(buf.glyph_infos, buf.glyph_positions)):
        name = tt.getGlyphName(info.codepoint)
        glyphs.append((name, pen_x + pos.x_offset))
        pen_x += pos.x_advance + kern.get(i, 0) + track * UPM
    # left side bearing of the first glyph, so x is the ink edge
    first_lsb = tt["hmtx"][glyphs[0][0]][1]
    last_name, last_x = glyphs[-1]
    from fontTools.pens.boundsPen import BoundsPen

    bp = BoundsPen(glyphset)
    glyphset[last_name].draw(bp)
    right_ink = last_x + bp.bounds[2]
    ox = x - first_lsb * scale
    for name, gx in glyphs:
        pen = SVGPathPen(glyphset, ntos=fmt)
        tpen = TransformPen(pen, (scale, 0, 0, -scale, ox + gx * scale, baseline))
        glyphset[name].draw(tpen)
        parts.append(pen.getCommands())
    return "".join(parts), x, ox + right_ink * scale


def rrect(x, y, w, h, r):
    """Rounded rectangle path."""
    return (
        f"M{fmt(x + r)} {fmt(y)}H{fmt(x + w - r)}"
        f"A{fmt(r)} {fmt(r)} 0 0 1 {fmt(x + w)} {fmt(y + r)}V{fmt(y + h - r)}"
        f"A{fmt(r)} {fmt(r)} 0 0 1 {fmt(x + w - r)} {fmt(y + h)}H{fmt(x + r)}"
        f"A{fmt(r)} {fmt(r)} 0 0 1 {fmt(x)} {fmt(y + h - r)}V{fmt(y + r)}"
        f"A{fmt(r)} {fmt(r)} 0 0 1 {fmt(x + r)} {fmt(y)}Z"
    )


def cushion(x, y, w, h, r, bow):
    """Plate with gently bowed (convex) long edges, like pressed enamel."""
    t, b = y, y + h
    return (
        f"M{fmt(x + r)} {fmt(t)}"
        f"Q{fmt(x + w / 2)} {fmt(t - bow)} {fmt(x + w - r)} {fmt(t)}"
        f"Q{fmt(x + w)} {fmt(t)} {fmt(x + w)} {fmt(t + r)}"
        f"V{fmt(b - r)}"
        f"Q{fmt(x + w)} {fmt(b)} {fmt(x + w - r)} {fmt(b)}"
        f"Q{fmt(x + w / 2)} {fmt(b + bow)} {fmt(x + r)} {fmt(b)}"
        f"Q{fmt(x)} {fmt(b)} {fmt(x)} {fmt(b - r)}"
        f"V{fmt(t + r)}"
        f"Q{fmt(x)} {fmt(t)} {fmt(x + r)} {fmt(t)}Z"
    )


def svg(w, h, body, defs="", title="conaulicy", extra=""):
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {fmt(w)} {fmt(h)}" '
        f'width="{fmt(w)}" height="{fmt(h)}" role="img" aria-label="{title}"{extra}>'
        f"<title>{title}</title>"
        + (f"<defs>{defs}</defs>" if defs else "")
        + body
        + "</svg>\n"
    )


def colours(mode):
    if mode == "mono":
        return "currentColor", "currentColor"
    return AMBER[mode], INK[mode]


# Wordmark shared by A and B: "conaulicy", optical kerning tuned by eye at
# 24 px: open c-o slightly, tighten l-i and c-y.
WORD_SIZE = 25
WORD_KERN = {0: 6, 5: -6, 7: -4}


def wordmark(x, baseline, size=WORD_SIZE):
    return text_path("conaulicy", size, x, baseline, kern=WORD_KERN)


# ------------------------------------------------------------------ A
def variant_a(mode, uid="a"):
    """Tabliczka: filled enamel badge with an inset rim; ul. knocked out."""
    plate, ink = colours(mode)
    H = 34
    pw, ph, pr = 48, 34, 8
    # "ul." centred on the plate by its x-height, nudged up 0.5 px.
    size = 21
    x_h = size * XH
    base = ph / 2 + x_h / 2 - 0.5
    d_ul, l, r = text_path("ul.", size, 0, base, kern={0: -10, 1: 10})
    ul_w = r - l
    ux = (pw - ul_w) / 2 + 0.6  # optical: the period is light, shift right
    d_ul, _, _ = text_path("ul.", size, ux, base, kern={0: -10, 1: 10})
    rim = rrect(2.6, 2.6, pw - 5.2, ph - 5.2, pr - 2.6)
    screws = ""
    mask = (
        f'<mask id="{uid}k" maskUnits="userSpaceOnUse" x="0" y="0" width="{pw}" height="{ph}">'
        f'<path fill="#fff" d="{rrect(0, 0, pw, ph, pr)}"/>'
        f'<path fill="none" stroke="#000" stroke-width="1" d="{rim}"/>'
        f'<g fill="#000"><path d="{d_ul}"/>{screws}</g></mask>'
    )
    plate_el = f'<path fill="{plate}" mask="url(#{uid}k)" d="{rrect(0, 0, pw, ph, pr)}"/>'
    wx = pw + 10
    d_w, _, wr = wordmark(wx, ph / 2 + WORD_SIZE * XH / 2)
    word_el = f'<path fill="{ink}" d="{d_w}"/>'
    return svg(wr + 1, H, plate_el + word_el, defs=mask)


def favicon_a():
    """Plate only: no rim or screws at 16 px; ul. large."""
    s = 32
    size = 19.5
    base = s / 2 + size * XH / 2 - 0.3
    d, l, r = text_path("ul.", size, 0, base, kern={0: -12, 1: 6})
    d, _, _ = text_path("ul.", size, (s - (r - l)) / 2 + 0.5, base, kern={0: -12, 1: 6})
    return favicon_svg(
        f'<path class="p" d="{rrect(0, 2, 32, 28, 7)}"/><path class="t" d="{d}"/>'
    )


# ------------------------------------------------------------------ B
def variant_b(mode, uid="b"):
    """Latarnia: an outlined hanging sign on a bracket, lit by a small lamp."""
    plate, ink = colours(mode)
    H = 40
    sw = 2.4
    # Bracket arm from the wall (x=1) out to the lamp, with a wall plate.
    arm_y = 4
    px, py, pw, ph, pr = 3, 12, 46, 27, 6
    lamp_x, lamp_y = pw + px + 4.5, arm_y + 4.2
    size = 19
    base = py + ph / 2 + size * XH / 2 - 0.4
    d_ul, l, r = text_path("ul.", size, 0, base, kern={0: -10, 1: 10})
    ux = px + (pw - (r - l)) / 2 + 0.5
    d_ul, _, _ = text_path("ul.", size, ux, base, kern={0: -10, 1: 10})
    hang = "".join(
        f'<path d="M{fmt(x)} {fmt(arm_y)}V{fmt(py)}"/>' for x in (px + 9, px + pw - 9)
    )
    arm = (
        f'<path d="M{fmt(sw / 2)} {fmt(arm_y - 3)}V{fmt(arm_y + 3)}"/>'  # wall plate
        f'<path d="M{fmt(sw / 2)} {fmt(arm_y)}H{fmt(lamp_x)}"/>'
        f'<path d="M{fmt(lamp_x)} {fmt(arm_y)}v1.2"/>'
    )
    strokes = (
        f'<g fill="none" stroke="{plate}" stroke-width="{sw}" stroke-linecap="round">'
        f"{arm}{hang}"
        f'<path stroke-width="{sw}" d="{rrect(px, py, pw, ph, pr)}"/></g>'
    )
    defs = ""
    glow = ""
    if mode != "mono":
        strength = ".5" if mode == "dark" else ".38"
        defs = (
            f'<radialGradient id="{uid}g" cx="{fmt(lamp_x)}" cy="{fmt(lamp_y + 2)}" r="15" '
            f'gradientUnits="userSpaceOnUse">'
            f'<stop offset="0" stop-color="#FFB547" stop-opacity="{strength}"/>'
            f'<stop offset=".45" stop-color="#FFB547" stop-opacity=".14"/>'
            f'<stop offset="1" stop-color="#FFB547" stop-opacity="0"/></radialGradient>'
        )
        glow = f'<circle fill="url(#{uid}g)" cx="{fmt(lamp_x)}" cy="{fmt(lamp_y + 2)}" r="15"/>'
    # A small street lantern hanging from the arm: roof, lit glass, base.
    lx, ly = lamp_x, arm_y + 1.6
    lamp = (
        f'<path fill="{plate}" d="M{fmt(lx - 3.6)} {fmt(ly + 2.6)}L{fmt(lx)} {fmt(ly)}'
        f'L{fmt(lx + 3.6)} {fmt(ly + 2.6)}Z"/>'
        f'<path fill="{plate}" d="{rrect(lx - 2.4, ly + 3.2, 4.8, 5.6, 1)}"/>'
        f'<path fill="{plate}" d="{rrect(lx - 3, ly + 9.2, 6, 1.4, .7)}"/>'
    )
    ul = f'<path fill="{plate}" d="{d_ul}"/>'
    wx = lamp_x + 9
    d_w, _, wr = wordmark(wx, py + ph / 2 + WORD_SIZE * XH / 2)
    word = f'<path fill="{ink}" d="{d_w}"/>'
    return svg(wr + 1, H, glow + strokes + lamp + ul + word, defs=defs)


def favicon_b():
    """The sign only: outlined plate hanging from a hook on a V cord."""
    size = 18
    base = 20.6 + size * XH / 2 - 0.3
    d, l, r = text_path("ul.", size, 0, base, kern={0: -12, 1: 6})
    d, _, _ = text_path("ul.", size, (32 - (r - l)) / 2 + 0.4, base, kern={0: -12, 1: 6})
    return favicon_svg(
        f'<path class="s" fill="none" stroke-width="3.2" stroke-linecap="round" '
        f'd="M8.5 9.5L16 3.4L23.5 9.5"/>'
        f'<circle class="p" cx="16" cy="2.6" r="2.2"/>'
        f'<path class="s" fill="none" stroke-width="3.2" d="{rrect(2, 10, 28, 20.4, 5.5)}"/>'
        f'<path class="p" d="{d}"/>'
    )


# ------------------------------------------------------------------ C
def variant_c(mode, uid="c"):
    """Ulica conaulicy: the name is the street. One cushion plate."""
    plate, _ = colours(mode)
    ph = 34
    big = 25
    small = 14.5
    base = ph / 2 + big * XH / 2
    pad = 11
    d_ul, ul_l, ul_r = text_path("ul.", small, pad, base, kern={0: -12, 1: 10})
    gap = 7
    d_w, _, wr = text_path("conaulicy", big, ul_r + gap, base, kern=WORD_KERN)
    pw = wr + pad
    shape = cushion(0, 1.5, pw, ph - 3, 7, 1.4)
    mask = (
        f'<mask id="{uid}k" maskUnits="userSpaceOnUse" x="0" y="0" width="{fmt(pw)}" height="{ph}">'
        f'<path fill="#fff" d="{shape}"/>'
        f'<g fill="#000"><path d="{d_ul}"/><path d="{d_w}"/></g></mask>'
    )
    return svg(pw, ph, f'<path fill="{plate}" mask="url(#{uid}k)" d="{shape}"/>', defs=mask)


def favicon_c():
    """The plate's first letter: c on a cushion tile."""
    size = 30
    base = 16 + size * XH / 2
    d, l, r = text_path("c", size, 0, base)
    d, _, _ = text_path("c", size, (32 - (r - l)) / 2 + 0.4, base)
    return favicon_svg(
        f'<path class="p" d="{cushion(0, 1.5, 32, 29, 7, 1.2)}"/>'
        f'<path class="t" d="{d}"/>'
    )


def favicon_svg(body):
    """32×32, theme-aware: amber plate + dark text, deeper amber in light."""
    style = (
        "<style>.p{fill:#FFB547}.s{stroke:#FFB547}.t{fill:#10141D}"
        "@media (prefers-color-scheme:light){.p{fill:#9A5700}.s{stroke:#9A5700}"
        ".t{fill:#FFF}}</style>"
    )
    return svg(32, 32, style + body)


VARIANTS = {
    "a": (variant_a, favicon_a),
    "b": (variant_b, favicon_b),
    "c": (variant_c, favicon_c),
}

for key, (full, fav) in VARIANTS.items():
    for mode in ("dark", "light", "mono"):
        with open(f"{OUT}/{key}-logo-{mode}.svg", "w") as fh:
            fh.write(full(mode, uid=f"{key}{mode[0]}"))
    with open(f"{OUT}/{key}-favicon.svg", "w") as fh:
        fh.write(fav())
print("ok", sorted(os.listdir(OUT)))
