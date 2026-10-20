"""Option A "Tabliczka", refined (task 22): flat mark + realistic enamel hero.

Both tiers share one plate geometry (PLATE). "ul." is placed by optical
centring: halfway between its bounding-box centre and its mass centroid
(area-weighted, from the outlines), so the light period and the thin
ascender of "l" do not pull it off centre. Radii are concentric: the rim's
radius is the plate's minus the rim inset.

Usage: python make_logo_a.py OUT_DIR   (needs fonttools, uharfbuzz)
Writes SVGs plus measure.json (centring numbers for the debug overlay).
"""
import json
import os
import sys

import uharfbuzz as hb
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.statisticsPen import StatisticsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

HERE = os.path.dirname(os.path.abspath(__file__))
FONTS = os.path.join(HERE, "../../../web/assets/fonts")
OUT = sys.argv[1] if len(sys.argv) > 1 else "out"
os.makedirs(OUT, exist_ok=True)


class Face:
    def __init__(self, file):
        path = os.path.join(FONTS, file)
        self.tt = TTFont(path)
        self.glyphs = self.tt.getGlyphSet()
        self.upm = self.tt["head"].unitsPerEm
        self.hb = hb.Font(hb.Face(hb.Blob.from_file_path(path)))
        self.xh = self.tt["OS/2"].sxHeight / self.upm
        self.cap = self.tt["OS/2"].sCapHeight / self.upm


BOLD = Face("AtkinsonHyperlegibleNext-Bold.ttf")
REGULAR = Face("AtkinsonHyperlegibleNext-Regular.ttf")


def fmt(v):
    s = f"{v:.2f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


def shape(face, s, kern):
    buf = hb.Buffer()
    buf.add_str(s)
    buf.guess_segment_properties()
    hb.shape(face.hb, buf, {"kern": True, "liga": False})
    x = 0.0
    out = []
    for i, (info, pos) in enumerate(zip(buf.glyph_infos, buf.glyph_positions)):
        out.append((face.tt.getGlyphName(info.codepoint), x + pos.x_offset))
        x += pos.x_advance + kern.get(i, 0)
    return out


def run(face, s, size, x, baseline, kern=None):
    """Outline s; x is the left ink edge. Returns d, bounds, centroid."""
    kern = kern or {}
    glyphs = shape(face, s, kern)
    sc = size / face.upm
    ox = x - face.tt["hmtx"][glyphs[0][0]][1] * sc
    d = []
    bp = BoundsPen(face.glyphs)
    st = StatisticsPen(glyphset=face.glyphs)
    for name, gx in glyphs:
        t = (sc, 0, 0, -sc, ox + gx * sc, baseline)
        pen = SVGPathPen(face.glyphs, ntos=fmt)
        face.glyphs[name].draw(TransformPen(pen, t))
        face.glyphs[name].draw(TransformPen(bp, t))
        face.glyphs[name].draw(TransformPen(st, t))
        d.append(pen.getCommands())
    return "".join(d), bp.bounds, (st.meanX, st.meanY)


def rrect(x, y, w, h, r):
    return (
        f"M{fmt(x + r)} {fmt(y)}H{fmt(x + w - r)}"
        f"A{fmt(r)} {fmt(r)} 0 0 1 {fmt(x + w)} {fmt(y + r)}V{fmt(y + h - r)}"
        f"A{fmt(r)} {fmt(r)} 0 0 1 {fmt(x + w - r)} {fmt(y + h)}H{fmt(x + r)}"
        f"A{fmt(r)} {fmt(r)} 0 0 1 {fmt(x)} {fmt(y + h - r)}V{fmt(y + r)}"
        f"A{fmt(r)} {fmt(r)} 0 0 1 {fmt(x + r)} {fmt(y)}Z"
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


AMBER = {"dark": "#FFB547", "light": "#9A5700"}
INK = {"dark": "#E9EDF2", "light": "#161B24"}
BG = {"dark": "#10141D", "light": "#F5F7FA"}
ENAMEL_INK = "#0F1419"

# ---------------------------------------------------------------- geometry
UL_KERN = {0: -14, 1: 6}  # u|l closed a touch, l|. opened: by eye at 400 %
OPTICAL = 0.5  # 0 = bounding-box centring, 1 = mass centring


def plate_geometry(H=34.0):
    """The one plate both tiers use. All numbers scale with H."""
    k = H / 34
    R = 9.5 * k  # outer corner radius
    inset = 3.2 * k  # outer edge → rim centre line
    rim_w = 1.3 * k
    inner = inset + rim_w / 2  # outer edge → rim inner edge
    pad = 5.4 * k  # rim inner edge → ink (bbox), all four sides
    # Font size so the ink (l ascender to u overshoot) fills H - 2(inner+pad).
    ink_h = H - 2 * (inner + pad)
    # ink spans from l top (708) to u bottom overshoot (-12): 720 units
    size = ink_h / 0.720
    # Measure at the origin, then size the plate around the ink.
    _, b, _ = run(BOLD, "ul.", size, 0, 0, UL_KERN)
    ink_w = b[2] - b[0]
    W = ink_w + 2 * (inner + pad)
    return dict(H=H, W=W, R=R, inset=inset, rim_w=rim_w, rim_r=R - inset,
                inner=inner, pad=pad, size=size, k=k)


def place_ul(g, optical=OPTICAL):
    """Position "ul." on plate g; returns d, bounds, centroid, offsets."""
    size = g["size"]
    # Start bbox-centred: ink box centred in the plate.
    d, b, c = run(BOLD, "ul.", size, 0, 0, UL_KERN)
    bw, bh = b[2] - b[0], b[3] - b[1]
    x0 = (g["W"] - bw) / 2
    base0 = (g["H"] - bh) / 2 - b[1]  # b[1] is negative (ascender, y-down)
    d, b, c = run(BOLD, "ul.", size, x0, base0, UL_KERN)
    bbox_c = ((b[0] + b[2]) / 2, (b[1] + b[3]) / 2)
    # Optical shift: move part of the way from bbox centre to mass centring.
    dx = (g["W"] / 2 - c[0]) * optical
    dy = (g["H"] / 2 - c[1]) * optical
    d, b, c = run(BOLD, "ul.", size, x0 + dx, base0 + dy, UL_KERN)
    return d, b, c, (dx, dy), base0 + dy


G = plate_geometry()
UL_D, UL_B, UL_C, UL_SHIFT, UL_BASE = place_ul(G)


def plate_paths(g, x=0.0, y=0.0):
    outer = rrect(x, y, g["W"], g["H"], g["R"])
    rim = rrect(x + g["inset"], y + g["inset"], g["W"] - 2 * g["inset"],
                g["H"] - 2 * g["inset"], g["rim_r"])
    return outer, rim


# ---------------------------------------------------------------- flat mark
WORD_KERN = {0: 6, 5: -6, 7: -4}


def flat_plate(g, colour, uid, x=0.0, y=0.0, ul_d=None):
    """Filled plate, rim and "ul." knocked out (mask), at (x, y)."""
    outer, rim = plate_paths(g, x, y)
    ul_d = ul_d or UL_D
    mask = (
        f'<mask id="{uid}" maskUnits="userSpaceOnUse" x="{fmt(x)}" y="{fmt(y)}" '
        f'width="{fmt(g["W"])}" height="{fmt(g["H"])}">'
        f'<path fill="#fff" d="{outer}"/>'
        f'<path fill="none" stroke="#000" stroke-width="{fmt(g["rim_w"])}" d="{rim}"/>'
        f'<path d="{ul_d}"/></mask>'
    )
    return mask, f'<path fill="{colour}" mask="url(#{uid})" d="{outer}"/>'


def lockup(mode, uid="a"):
    """Plate + conaulicy. Plate height = 1.6 × the wordmark's cap height;
    the wordmark sits on the baseline of "ul." on the plate."""
    plate = "currentColor" if mode == "mono" else AMBER[mode]
    ink = "currentColor" if mode == "mono" else INK[mode]
    g = G
    word_size = g["H"] / (1.6 * BOLD.cap)
    gap = 0.34 * g["H"]
    mask, plate_el = flat_plate(g, plate, f"{uid}k")
    d, b, _ = run(BOLD, "conaulicy", word_size, g["W"] + gap, UL_BASE, WORD_KERN)
    width = b[2] + 0.5
    return svg(width, g["H"], plate_el + f'<path fill="{ink}" d="{d}"/>', defs=mask), dict(
        word_size=word_size, gap=gap, word_baseline=UL_BASE,
        word_xheight_centre=UL_BASE - word_size * BOLD.xh / 2, width=width)


def mark_only(mode, uid="am"):
    plate = "currentColor" if mode == "mono" else AMBER[mode]
    mask, plate_el = flat_plate(G, plate, uid)
    return svg(G["W"], G["H"], plate_el, defs=mask)


# ---------------------------------------------------------------- favicons
def favicon(px):
    """Pixel-snapped favicon for a px × px grid (16 or 32): plate edges and
    the baseline on whole pixels, x-height a whole number of pixels."""
    if px == 16:
        plate_y, plate_h, r = 2, 12, 3
        xh_px = 5  # x-height in pixels
    else:
        plate_y, plate_h, r = 3, 26, 6.5
        xh_px = 10
    size = xh_px / BOLD.xh
    d, b, c = run(BOLD, "ul.", size, 0, 0, UL_KERN)
    w = b[2] - b[0]
    # Horizontal: optical centring as on the plate; vertical: x-height band
    # centred, baseline snapped to a whole pixel.
    x = (px - w) / 2
    _, b2, c2 = run(BOLD, "ul.", size, x, 0, UL_KERN)
    x += (px / 2 - c2[0]) * OPTICAL
    centre = plate_y + plate_h / 2
    baseline = round(centre + xh_px / 2 + (0.5 if px == 16 else 0.6))
    d, b, c = run(BOLD, "ul.", size, round(x * 2) / 2, baseline, UL_KERN)
    style = (
        "<style>.p{fill:#FFB547}.t{fill:#10141D}"
        "@media (prefers-color-scheme:light){.p{fill:#9A5700}.t{fill:#FFF}}</style>"
    )
    body = (
        style
        + f'<path class="p" d="{rrect(0, plate_y, px, plate_h, r)}"/>'
        + f'<path class="t" d="{d}"/>'
    )
    return svg(px, px, body, extra=' shape-rendering="geometricPrecision"')


# ---------------------------------------------------------------- realistic
def enamel_plate(g, uid, x, y, scale=1.0, wall="dark", shadow=True):
    """The realistic tier: same geometry as the flat plate, drawn as a
    domed, enamelled steel plate with a rolled rim, two rivets, fine grain
    and a soft shadow on the wall. Pure SVG: gradients and filters only."""
    s = scale
    W, H = g["W"] * s, g["H"] * s
    outer = rrect(x, y, W, H, g["R"] * s)
    ins = g["inset"] * s
    rim = rrect(x + ins, y + ins, W - 2 * ins, H - 2 * ins, g["rim_r"] * s)
    field_in = (g["inset"] + g["rim_w"] / 2) * s
    field = rrect(x + field_in, y + field_in, W - 2 * field_in, H - 2 * field_in,
                  (g["R"] - g["inset"] - g["rim_w"] / 2) * s)
    d, _, _ = run(BOLD, "ul.", g["size"] * s, x + (UL_B[0]) * s, y + UL_BASE * s, UL_KERN)
    shade = 0.5 if wall == "dark" else 0.28
    defs = (
        # Dome: lighter towards the top, deeper amber at the bottom edge.
        f'<linearGradient id="{uid}dome" x1="0" y1="{fmt(y)}" x2="0" y2="{fmt(y + H)}" gradientUnits="userSpaceOnUse">'
        '<stop offset="0" stop-color="#FFD089"/><stop offset=".38" stop-color="#FFB547"/>'
        '<stop offset=".82" stop-color="#F29E2E"/><stop offset="1" stop-color="#D9851C"/></linearGradient>'
        # Specular highlight: a soft oval across the upper left of the dome.
        f'<radialGradient id="{uid}spec" cx="{fmt(x + W * .34)}" cy="{fmt(y + H * .2)}" '
        f'r="{fmt(W * .55)}" gradientTransform="translate(0 {fmt(y + H * .2)}) scale(1 .42) translate(0 {fmt(-(y + H * .2))})" '
        'gradientUnits="userSpaceOnUse">'
        '<stop offset="0" stop-color="#FFF" stop-opacity=".62"/>'
        '<stop offset=".35" stop-color="#FFF" stop-opacity=".18"/>'
        '<stop offset="1" stop-color="#FFF" stop-opacity="0"/></radialGradient>'
        # Rolled rim: catches light on top, falls into shadow underneath.
        f'<linearGradient id="{uid}rim" x1="0" y1="{fmt(y)}" x2="0" y2="{fmt(y + H)}" gradientUnits="userSpaceOnUse">'
        '<stop offset="0" stop-color="#FFE7B8"/><stop offset=".5" stop-color="#E8962A"/>'
        '<stop offset="1" stop-color="#A9630F"/></linearGradient>'
        # Edge of the steel sheet: darker band all round.
        f'<linearGradient id="{uid}edge" x1="0" y1="{fmt(y)}" x2="0" y2="{fmt(y + H)}" gradientUnits="userSpaceOnUse">'
        '<stop offset="0" stop-color="#F7B04A"/><stop offset="1" stop-color="#9C5A0E"/></linearGradient>'
        # Enamel grain and the faintest wear: fractal noise, very low alpha.
        f'<filter id="{uid}grain" x="0" y="0" width="100%" height="100%">'
        '<feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="7" result="n"/>'
        '<feColorMatrix in="n" type="matrix" values="0 0 0 0 .35  0 0 0 0 .22  0 0 0 0 .05  0 0 0 .55 -.18"/>'
        '<feComposite in2="SourceGraphic" operator="in"/></filter>'
        f'<filter id="{uid}wear" x="0" y="0" width="100%" height="100%">'
        '<feTurbulence type="fractalNoise" baseFrequency=".035 .06" numOctaves="3" seed="3" result="n"/>'
        '<feColorMatrix in="n" type="matrix" values="0 0 0 0 .55  0 0 0 0 .33  0 0 0 0 .08  0 0 0 2.4 -1.55"/>'
        '<feComposite in2="SourceGraphic" operator="in"/></filter>'
        # Pressed letters: a hairline highlight below, shade above (debossed
        # into the dome) — read as enamel paint with a little relief.
        f'<filter id="{uid}press" x="-5%" y="-5%" width="110%" height="110%">'
        f'<feOffset dy="{fmt(.32 * s)}" in="SourceAlpha" result="o"/>'
        '<feFlood flood-color="#FFF4DD" flood-opacity=".42"/><feComposite in2="o" operator="in" result="hi"/>'
        f'<feOffset dy="{fmt(-.35 * s)}" in="SourceAlpha" result="o2"/>'
        '<feFlood flood-color="#3A2204" flood-opacity=".55"/><feComposite in2="o2" operator="in" result="lo"/>'
        '<feMerge><feMergeNode in="hi"/><feMergeNode in="lo"/><feMergeNode in="SourceGraphic"/></feMerge></filter>'
        f'<filter id="{uid}shadow" x="-30%" y="-30%" width="160%" height="190%">'
        f'<feDropShadow dx="0" dy="{fmt(2.2 * s)}" stdDeviation="{fmt(2.4 * s)}" flood-color="#000" flood-opacity="{shade}"/>'
        f'<feDropShadow dx="0" dy="{fmt(.5 * s)}" stdDeviation="{fmt(.5 * s)}" flood-color="#000" flood-opacity="{shade * .8}"/></filter>'
        f'<radialGradient id="{uid}rivet" cx=".38" cy=".32" r=".75">'
        '<stop offset="0" stop-color="#FFF6E2"/><stop offset=".45" stop-color="#E7A64B"/>'
        '<stop offset="1" stop-color="#7E4A0B"/></radialGradient>'
        f'<clipPath id="{uid}clip"><path d="{field}"/></clipPath>'
    )
    # Rivets on the diagonal corners, in the field between rim and letters.
    rv_r = 1.05 * s
    rv_off = (g["inset"] + g["rim_w"] + 2.1) * s
    rivets = "".join(
        f'<circle cx="{fmt(cx)}" cy="{fmt(cy)}" r="{fmt(rv_r + .45 * s)}" fill="#8A4F0A" opacity=".35"/>'
        f'<circle cx="{fmt(cx)}" cy="{fmt(cy)}" r="{fmt(rv_r)}" fill="url(#{uid}rivet)"/>'
        for cx, cy in ((x + rv_off, y + rv_off), (x + W - rv_off, y + H - rv_off))
    )
    body = (
        f'<g{" filter=" + chr(34) + "url(#" + uid + "shadow)" + chr(34) if shadow else ""}>'
        f'<path fill="url(#{uid}edge)" d="{outer}"/>'
        f'<path fill="url(#{uid}dome)" d="{rrect(x + .5 * s, y + .4 * s, W - s, H - 1.1 * s, (g["R"] - .5) * s)}"/>'
        "</g>"
        f'<path fill="none" stroke="url(#{uid}rim)" stroke-width="{fmt(g["rim_w"] * 1.35 * s)}" d="{rim}"/>'
        f'<path fill="none" stroke="#FFF" stroke-opacity=".35" stroke-width="{fmt(.35 * s)}" '
        f'transform="translate(0 {fmt(-.45 * s)})" d="{rim}"/>'
        f'<g clip-path="url(#{uid}clip)">'
        f'<path fill="#FFB547" filter="url(#{uid}grain)" d="{field}"/>'
        f'<path fill="#FFB547" filter="url(#{uid}wear)" opacity=".5" d="{field}"/>'
        "</g>"
        f'<path fill="{ENAMEL_INK}" filter="url(#{uid}press)" d="{d}"/>'
        f'<path fill="url(#{uid}spec)" d="{outer}"/>'
        + rivets
    )
    return defs, body


def hero(wall, w, h, scale, uid):
    g = G
    W, H = g["W"] * scale, g["H"] * scale
    x, y = (w - W) / 2, (h - H) / 2 - scale
    defs, body = enamel_plate(g, uid, x, y, scale, wall)
    bg = f'<rect width="{fmt(w)}" height="{fmt(h)}" fill="{BG[wall]}"/>'
    return svg(w, h, bg + body, defs=defs, title="conaulicy: tabliczka ul.")


def pdf_corner():
    """For the printed PDF: on white, a lighter shadow, no background."""
    g = G
    scale = 3
    pad = 10
    w, h = g["W"] * scale + 2 * pad, g["H"] * scale + 2 * pad + 4
    defs, body = enamel_plate(g, "pdf", pad, pad, scale, "light")
    return svg(w, h, body, defs=defs, title="conaulicy: tabliczka ul.")


def og_image():
    """1200 × 630 share card: the enamel plate on the night wall, a warm
    lamp glow, conaulicy.pl and one line in Polish. All text outlined."""
    w, h = 1200, 630
    g = G
    scale = 10
    W, H = g["W"] * scale, g["H"] * scale
    px, py = 92, (h - H) / 2 - 8
    defs, plate = enamel_plate(g, "og", px, py, scale, "dark")
    tx = px + W + 70
    d1, b1, _ = run(BOLD, "conaulicy.pl", 92, tx, 262, {0: 6, 5: -6, 7: -4})
    d2, b2, _ = run(REGULAR, "Wywozy śmieci", 52, tx, 350)
    d3, b3, _ = run(REGULAR, "przy Twojej ulicy.", 52, tx, 416)
    d4, _, _ = run(REGULAR, "Lubaczów i gmina", 34, tx, 492)
    defs += (
        '<radialGradient id="ogglow" cx="330" cy="200" r="520" gradientUnits="userSpaceOnUse">'
        '<stop offset="0" stop-color="#FFB547" stop-opacity=".22"/>'
        '<stop offset=".5" stop-color="#FFB547" stop-opacity=".06"/>'
        '<stop offset="1" stop-color="#FFB547" stop-opacity="0"/></radialGradient>'
        '<filter id="ogwall" x="0" y="0" width="100%" height="100%">'
        '<feTurbulence type="fractalNoise" baseFrequency=".75" numOctaves="2" seed="11" result="n"/>'
        '<feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .05 0"/>'
        '<feComposite in2="SourceGraphic" operator="in"/></filter>'
    )
    body = (
        f'<rect width="{w}" height="{h}" fill="#10141D"/>'
        f'<rect width="{w}" height="{h}" fill="#10141D" filter="url(#ogwall)"/>'
        f'<rect width="{w}" height="{h}" fill="url(#ogglow)"/>'
        + plate
        + f'<path fill="#E9EDF2" d="{d1}"/>'
        f'<path fill="#FFB547" d="{d2}"/><path fill="#FFB547" d="{d3}"/>'
        f'<path fill="#B4BCC8" d="{d4}"/>'
    )
    return svg(w, h, body, defs=defs, title="conaulicy.pl: wywozy śmieci przy Twojej ulicy")


# Share-card colours. Light (shipped since task 26, light-only site): GOV.UK
# text and secondary text, the Latarnia link step for the tagline. Dark: the
# task-23 card, kept for the archive.
OG = {
    "light": dict(bg="#FFFFFF", plate="#9A5700", title="#0B0C0C", lines="#8B4E00", small="#484949"),
    "dark": dict(bg=BG["dark"], plate=AMBER["dark"], title=INK["dark"], lines=AMBER["dark"], small="#B4BCC8"),
}


def og_flat(mode="light"):
    """The shipped 1200 × 630 share card: the flat plate, conaulicy.pl and
    one line in Polish, no glow or grain. All text outlined."""
    c = OG[mode]
    w, h = 1200, 630
    g = G
    scale = 10
    W, H = g["W"] * scale, g["H"] * scale
    px, py = 92, (h - H) / 2
    mask, plate = flat_plate(g, c["plate"], "og", 0, 0)
    tx = px + W + 70
    d1, _, _ = run(BOLD, "conaulicy.pl", 92, tx, 262, WORD_KERN)
    d2, _, _ = run(REGULAR, "Wywozy śmieci", 52, tx, 350)
    d3, _, _ = run(REGULAR, "przy Twojej ulicy.", 52, tx, 416)
    d4, _, _ = run(REGULAR, "Lubaczów i gmina", 34, tx, 492)
    body = (
        f'<rect width="{w}" height="{h}" fill="{c["bg"]}"/>'
        f'<g transform="translate({fmt(px)} {fmt(py)}) scale({scale})">{plate}</g>'
        f'<path fill="{c["title"]}" d="{d1}"/>'
        f'<path fill="{c["lines"]}" d="{d2}"/><path fill="{c["lines"]}" d="{d3}"/>'
        f'<path fill="{c["small"]}" d="{d4}"/>'
    )
    return svg(w, h, body, defs=mask, title="conaulicy.pl: wywozy śmieci przy Twojej ulicy")


# ---------------------------------------------------------------- debug
def previous_a():
    """The first A (PR #21, before task 22), rebuilt for the comparison:
    48 × 34 plate, radius 8, rim inset 2.6, "ul." bbox-centred + 0.6 px."""
    g = dict(H=34.0, W=48.0, R=8.0, inset=2.6, rim_w=1.0, rim_r=5.4, inner=3.1, size=21)
    kern = {0: -10, 1: 10}
    base = 34 / 2 + 21 * BOLD.xh / 2 - 0.5
    _, b, _ = run(BOLD, "ul.", 21, 0, base, kern)
    d, b, c = run(BOLD, "ul.", 21, (48 - (b[2] - b[0])) / 2 + 0.6, base, kern)
    return g, d, b, c


def overlay_panel(title, g, d, b, c, ox, s):
    """One plate at scale s with centre lines, bbox and centroid, pads."""
    X = lambda v: fmt(ox + v * s)
    Y = lambda v: fmt(60 + v * s)
    outer, rim = plate_paths(g)
    W, H = g["W"], g["H"]
    inner = g["inner"]
    pads = dict(
        L=b[0] - inner, R=W - inner - b[2], T=b[1] - inner, B=H - inner - b[3]
    )
    bc = ((b[0] + b[2]) / 2, (b[1] + b[3]) / 2)
    off = (c[0] - W / 2, c[1] - H / 2)
    t = (
        f'<g transform="translate({fmt(ox)} 60) scale({fmt(s)})">'
        f'<path fill="#FFB547" d="{outer}"/>'
        f'<path fill="none" stroke="#10141D" stroke-width="{fmt(g["rim_w"])}" d="{rim}"/>'
        f'<path fill="#10141D" d="{d}"/>'
        f'<rect x="{fmt(inner)}" y="{fmt(inner)}" width="{fmt(W - 2 * inner)}" height="{fmt(H - 2 * inner)}" '
        f'fill="none" stroke="#7a2fd0" stroke-width=".08" stroke-dasharray=".4 .3"/>'
        f'<path stroke="#00a3c4" stroke-width=".1" stroke-dasharray=".5 .3" d="M{fmt(W / 2)} -2V{fmt(H + 2)}M-2 {fmt(H / 2)}H{fmt(W + 2)}"/>'
        f'<rect x="{fmt(b[0])}" y="{fmt(b[1])}" width="{fmt(b[2] - b[0])}" height="{fmt(b[3] - b[1])}" fill="none" stroke="#1f63c7" stroke-width=".1"/>'
        f'<path stroke="#1f63c7" stroke-width=".14" d="M{fmt(bc[0] - .8)} {fmt(bc[1] - .8)}l1.6 1.6m0 -1.6l-1.6 1.6"/>'
        f'<circle cx="{fmt(c[0])}" cy="{fmt(c[1])}" r=".55" fill="#d4183a"/>'
        "</g>"
    )
    lines = [
        title,
        f"plate {W:.1f} × {H:.1f}, radius {g['R']:.1f}, rim radius {g['rim_r']:.1f} (inset {g['inset']:.1f})",
        f"pads to rim (ink box): left {pads['L']:.2f}  right {pads['R']:.2f}  top {pads['T']:.2f}  bottom {pads['B']:.2f}",
        f"mass centroid vs plate centre: {off[0]:+.2f} x, {off[1]:+.2f} y",
        f"bbox centre vs plate centre: {bc[0] - W / 2:+.2f} x, {bc[1] - H / 2:+.2f} y",
    ]
    txt = "".join(
        f'<text x="{fmt(ox)}" y="{fmt(60 + H * s + 34 + i * 22)}" font-size="{17 if i == 0 else 14}" '
        f'font-weight="{700 if i == 0 else 400}">{line}</text>'
        for i, line in enumerate(lines)
    )
    return t + txt


def overlay():
    s = 11
    pg, pd, pb, pc = previous_a()
    w = 60 + pg["W"] * s + 80 + G["W"] * s + 60
    h = 60 + 34 * s + 160
    legend = (
        '<text x="60" y="34" font-size="14">'
        '<tspan fill="#00a3c4">— — plate centre lines</tspan>   '
        '<tspan fill="#1f63c7">□ × ink bounding box and its centre</tspan>   '
        '<tspan fill="#d4183a">● mass centroid of “ul.”</tspan>   '
        '<tspan fill="#7a2fd0">- - rim inner edge</tspan></text>'
    )
    body = (
        f'<rect width="{fmt(w)}" height="{fmt(h)}" fill="#fff"/>'
        f'<g font-family="Atkinson Hyperlegible Next, sans-serif" fill="#161B24">{legend}'
        + overlay_panel("Previous A (bbox-centred)", pg, pd, pb, pc, 60, s)
        + overlay_panel("New A (optical: halfway to mass centroid)", G, UL_D, UL_B, UL_C, 60 + pg["W"] * s + 80, s)
        + "</g>"
    )
    return svg(w, h, body, title="Option A centring overlay")


# ---------------------------------------------------------------- write
def write(name, content):
    with open(os.path.join(OUT, name), "w") as fh:
        fh.write(content)


measures = {}
for mode in ("dark", "light", "mono"):
    content, info = lockup(mode, uid=f"a{mode[0]}")
    write(f"a-logo-{mode}.svg", content)
    measures["lockup"] = info
    write(f"a-mark-{mode}.svg", mark_only(mode, uid=f"am{mode[0]}"))
write("a-favicon.svg", favicon(32))
write("a-favicon-16.svg", favicon(16))
write("a-hero-dark.svg", hero("dark", 640, 400, 9, "hd"))
write("a-hero-light.svg", hero("light", 640, 400, 9, "hl"))
write("a-pdf-corner.svg", pdf_corner())
write("og-1200x630.svg", og_flat("light"))
write("a-og-dark.svg", og_flat("dark"))
write("a-og-enamel.svg", og_image())
write("a-centring-overlay.svg", overlay())

ink = UL_B
measures.update(
    plate={k: round(v, 3) for k, v in G.items()},
    ul_bounds=[round(v, 3) for v in ink],
    ul_centroid=[round(v, 3) for v in UL_C],
    ul_bbox_centre=[round((ink[0] + ink[2]) / 2, 3), round((ink[1] + ink[3]) / 2, 3)],
    optical_shift=[round(v, 3) for v in UL_SHIFT],
    pads={
        "left": round(ink[0] - G["inner"], 3),
        "right": round(G["W"] - G["inner"] - ink[2], 3),
        "top": round(ink[1] - G["inner"], 3),
        "bottom": round(G["H"] - G["inner"] - ink[3], 3),
    },
    ul_path=UL_D,
)
write("measure.json", json.dumps(measures, indent=1))
print(json.dumps({k: v for k, v in measures.items() if k != "ul_path"}, indent=1))
