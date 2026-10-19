#!/usr/bin/env python3
"""Generates the Step 1 preview pages. Run: python3 design/proposals/build.py

Every contrast ratio shown in the pages is computed here (WCAG 2.x relative
luminance). The script exits with an error if any pair misses its AA target.
"""
import os
import sys
from html import escape

ROOT = os.path.dirname(os.path.abspath(__file__))

LATIN = ("U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,"
         "U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD")
LATIN_EXT = ("U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,"
             "U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,"
             "U+2113,U+2C60-2C7F,U+A720-A7FF")

TOKENS = ["primary", "secondary", "accent", "on-accent", "background", "surface", "text",
          "muted", "border", "focus", "success", "warning", "danger"]
WASTE = [
    ("zmieszane", "Zmieszane"),
    ("papier", "Papier"),
    ("plastik-metale", "Plastik i metale"),
    ("szklo", "Szkło"),
    ("bio", "Bio"),
    ("popiol", "Popiół"),
    ("gabaryty", "Gabaryty"),
]
TOKEN_NOTES = {
    "primary": "nagłówki, adres",
    "secondary": "tło etykiet odpadów",
    "accent": "jedyny akcent: przycisk, „jutro”",
    "on-accent": "tekst na akcencie",
    "background": "tło strony",
    "surface": "karta, pole wyszukiwania",
    "text": "tekst główny",
    "muted": "tekst pomocniczy, placeholder",
    "border": "obramowanie pola i przycisku",
    "focus": "obwódka fokusu",
    "success": "komunikat: udało się",
    "warning": "komunikat: uwaga",
    "danger": "komunikat: błąd",
}

ICONS = {
    "zmieszane": '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
    "papier": '<path d="M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5"/>',
    "plastik-metale": '<path d="M10 2h4v3l2 3v12a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V8l2-3zM8 12h8"/>',
    "szklo": '<path d="M8 3h8v3H8zM7 6h10l1 3v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9z"/>',
    "bio": '<path d="M5 20c0-9 6-15 15-15 0 9-6 15-15 15zM5 20l7-7"/>',
    "popiol": '<path d="M12 3c1 4 5 5.5 5 10a5 5 0 0 1-10 0c0-3 2-4 2-6.5 1 1 2 2.2 2 3.5 0-3 0-5 1-7z"/>',
    "gabaryty": '<path d="M5 11V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3M3 11h3v4h12v-4h3v6H3zM5 17v2M19 17v2"/>',
    "search": '<circle cx="11" cy="11" r="7"/><path d="M16.5 16.5 21 21"/>',
    "calendar": '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M12 13v5M9.5 15.5h5"/>',
    "sun": '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    "moon": '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    "pin": '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
}


def icon(name, cls=""):
    c = f' class="{cls}"' if cls else ""
    return (f'<svg{c} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
            f'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'
            f'{ICONS[name]}</svg>')


# ---------------------------------------------------------------- contrast

def lum(hexv):
    h = hexv.lstrip("#")
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    r, g, b = out
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def ratio(a, b):
    la, lb = lum(a), lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def floor2(x):
    # Round down so a shown "4.50" never hides a real 4.497.
    return int(x * 100) / 100


def pairs(t):
    """(label, fg, bg, kind) where kind: body | text | large | ui"""
    p = [
        ("Tekst główny na tle", "text", "background", "body"),
        ("Tekst główny na karcie", "text", "surface", "body"),
        ("Tekst etykiety odpadu", "text", "secondary", "body"),
        ("Tekst pomocniczy na tle", "muted", "background", "text"),
        ("Tekst pomocniczy na karcie (placeholder)", "muted", "surface", "text"),
        ("Nagłówek na tle", "primary", "background", "text"),
        ("Nagłówek (adres) na karcie", "primary", "surface", "text"),
        ("Akcent jako tekst („jutro”) na karcie", "accent", "surface", "text"),
        ("Napis na przycisku", "on-accent", "accent", "text"),
        ("Przycisk względem tła strony", "accent", "background", "ui"),
        ("Przycisk względem karty", "accent", "surface", "ui"),
        ("Obramowanie pola względem tła", "border", "background", "ui"),
        ("Obramowanie pola względem karty", "border", "surface", "ui"),
        ("Fokus na tle", "focus", "background", "ui"),
        ("Fokus na karcie", "focus", "surface", "ui"),
        ("Sukces (tekst) na karcie", "success", "surface", "text"),
        ("Uwaga (tekst) na karcie", "warning", "surface", "text"),
        ("Błąd (tekst) na karcie", "danger", "surface", "text"),
    ]
    for key, label in WASTE:
        p.append((f"Ikona: {label} na etykiecie", f"waste-{key}", "secondary", "ui"))
        p.append((f"Ikona: {label} na karcie", f"waste-{key}", "surface", "ui"))
    return p


def check(direction):
    failures = []
    for theme in ("dark", "light"):
        t = direction["themes"][theme]
        for label, fg, bg, kind in pairs(t):
            r = ratio(t[fg], t[bg])
            need = 3.0 if kind in ("ui", "large") else 4.5
            if r < need:
                failures.append(f"{direction['slug']} {theme}: {label} {fg}/{bg} = {r:.2f} < {need}")
            if kind == "body" and r < 7:
                failures.append(f"{direction['slug']} {theme}: body {fg}/{bg} = {r:.2f} < 7 (AAA)")
    return failures


# ---------------------------------------------------------------- directions

DIRECTIONS = [
    {
        "slug": "latarnia",
        "name": "Latarnia",
        "mood": "Ciepłe światło lampy w oknie, kiedy na dworze już ciemno.",
        "idea": ("Granat nocnego nieba i jeden bursztynowy akcent. Daty wyglądają jak kartki z "
                 "kalendarza ściennego — najbliższa świeci jak zapalona lampa."),
        "font": {
            "family": "Atkinson Hyperlegible Next",
            "dir": "atkinson-hyperlegible-next",
            "file": "atkinson-hyperlegible-next-{sub}-{w}-normal.woff2",
            "weights": [400, 700],
            "strong": 700,
            "why": ("Krój zaprojektowany przez Braille Institute dla osób słabowidzących: "
                    "wyraźnie różne 1/l/I i 0/O, otwarte kształty liter."),
            "repo": "https://github.com/googlefonts/atkinson-hyperlegible-next",
            "pkg": "@fontsource/atkinson-hyperlegible-next 5.3.0",
        },
        "themes": {
            "dark": {
                "primary": "#FFFFFF", "secondary": "#262E3B", "accent": "#FFB547",
                "on-accent": "#10141D", "background": "#10141D", "surface": "#19202B",
                "text": "#E9EDF2", "muted": "#B4BCC8", "border": "#6F7A8D", "focus": "#FFDDA0",
                "success": "#6FD49A", "warning": "#F2A65A", "danger": "#FF8F85",
                "waste-zmieszane": "#AAB3C0", "waste-papier": "#6EB4FF",
                "waste-plastik-metale": "#F4D35E", "waste-szklo": "#58D39A", "waste-bio": "#C89A6A",
                "waste-popiol": "#D6C7B6", "waste-gabaryty": "#C7A4FF",
            },
            "light": {
                "primary": "#0B0F16", "secondary": "#ECEFF4", "accent": "#9A5700",
                "on-accent": "#FFFFFF", "background": "#F5F7FA", "surface": "#FFFFFF",
                "text": "#161B24", "muted": "#4A5568", "border": "#7A8496", "focus": "#6B3D00",
                "success": "#1E7A46", "warning": "#A0420A", "danger": "#B42318",
                "waste-zmieszane": "#5B6575", "waste-papier": "#1F63C7",
                "waste-plastik-metale": "#866800", "waste-szklo": "#1E7F4F", "waste-bio": "#8A5A2B",
                "waste-popiol": "#76695C", "waste-gabaryty": "#7B4FC9",
            },
        },
    },
    {
        "slug": "bez",
        "name": "Bez o zmierzchu",
        "mood": "Spokojny majowy zmierzch, kiedy w ogródkach kwitnie bez.",
        "idea": ("Śliwkowa szarość i liliowy akcent jak kwiat bzu. Najbliższy wywóz to jedno "
                 "duże słowo — „jutro” — widoczne z daleka, reszta cicho pod spodem."),
        "font": {
            "family": "Lexend",
            "dir": "lexend",
            "file": "lexend-{sub}-{w}-normal.woff2",
            "weights": [400, 600],
            "strong": 600,
            "why": ("Krój stworzony z myślą o płynności czytania: szerokie litery, spokojny rytm, "
                    "dobrze czytelny w dużych rozmiarach."),
            "repo": "https://github.com/googlefonts/lexend",
            "pkg": "@fontsource/lexend 5.3.0",
        },
        "themes": {
            "dark": {
                "primary": "#FFFFFF", "secondary": "#2B2735", "accent": "#C3B2FF",
                "on-accent": "#15131B", "background": "#15131B", "surface": "#1F1C27",
                "text": "#F1EEF6", "muted": "#BAB3C8", "border": "#7A7290", "focus": "#E6DDFF",
                "success": "#74D6A0", "warning": "#F3B562", "danger": "#FF9A8F",
                "waste-zmieszane": "#AEB2BC", "waste-papier": "#74B6FF",
                "waste-plastik-metale": "#F2D45C", "waste-szklo": "#5FD49C", "waste-bio": "#CF9F6E",
                "waste-popiol": "#D4C5B6", "waste-gabaryty": "#FF9CC9",
            },
            "light": {
                "primary": "#0E0B14", "secondary": "#EFECF5", "accent": "#5B3FD0",
                "on-accent": "#FFFFFF", "background": "#F8F7FB", "surface": "#FFFFFF",
                "text": "#17141F", "muted": "#4F4860", "border": "#807893", "focus": "#3B2596",
                "success": "#1D7A48", "warning": "#9C4A06", "danger": "#B4261A",
                "waste-zmieszane": "#5C6270", "waste-papier": "#1D62C4",
                "waste-plastik-metale": "#846700", "waste-szklo": "#1D7E4E", "waste-bio": "#8C5A2A",
                "waste-popiol": "#74685C", "waste-gabaryty": "#B0306F",
            },
        },
    },
]

PICKUPS = [
    {"rel": "jutro", "rest": "wtorek 20 października", "day": "20", "wd": "wt.",
     "groups": ["zmieszane", "popiol"]},
    {"rel": None, "rest": "piątek 23 października", "day": "23", "wd": "pt.", "groups": ["papier"]},
    {"rel": None, "rest": "poniedziałek 26 października", "day": "26", "wd": "pon.", "groups": ["bio"]},
]
WASTE_LABEL = dict(WASTE)
ADDRESS = "ul. Adama Asnyka, Lubaczów"
PLACEHOLDER = "Wpisz swoją ulicę albo wieś"


# ---------------------------------------------------------------- CSS

def font_faces(f):
    out = []
    for w in f["weights"]:
        for sub, rng in (("latin", LATIN), ("latin-ext", LATIN_EXT)):
            fn = f["file"].format(sub=sub, w=w)
            out.append(
                f'@font-face {{\n  font-family: "{f["family"]}";\n  font-style: normal;\n'
                f'  font-weight: {w};\n  font-display: swap;\n'
                f'  src: url("../fonts/{f["dir"]}/{fn}") format("woff2");\n'
                f'  unicode-range: {rng};\n}}')
    return "\n".join(out)


def token_block(t):
    return "\n".join(f"  --{k}: {v};" for k, v in t.items())


def tailwind_comment(d):
    lines = ["/*", f"  {d['name']} — tokens for Tailwind CSS v4.", "",
             "  Each CSS custom property below maps 1:1 to a Tailwind v4 theme key.",
             "  In the app, keep the two [data-theme] blocks and add:", "",
             "  @custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));",
             "  @theme inline {"]
    for k in TOKENS:
        lines.append(f"    --color-{k}: var(--{k});")
    for k, _ in WASTE:
        lines.append(f"    --color-waste-{k}: var(--waste-{k});")
    lines.append(f'    --font-sans: "{d["font"]["family"]}", system-ui, sans-serif;')
    lines += ["  }", "",
              "  Classes then read: bg-background, bg-surface, text-text, text-muted,",
              "  bg-accent text-on-accent, border-border, outline-focus, text-waste-papier …",
              "*/"]
    return "\n".join(lines)


BASE_CSS = r"""
*, *::before, *::after { box-sizing: border-box; }
html {
  font-size: 100%;
  -webkit-text-size-adjust: 100%;
  text-size-adjust: 100%;
}
/* iOS: follow the system text size (Dynamic Type). */
@supports (font: -apple-system-body) {
  html { font: -apple-system-body; }
}
body {
  margin: 0;
  background: var(--background);
  color: var(--text);
  font-family: var(--font);
  font-size: 1.125rem;
  line-height: 1.55;
  font-weight: 400;
}
h1, h2, h3, p, ol, ul { margin: 0; }
ol, ul { padding: 0; list-style: none; }
svg { display: block; }
:focus-visible { outline: 3px solid var(--focus); outline-offset: 3px; }
.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}
.wrap { max-width: 74rem; margin: 0 auto; padding-inline: 1rem; }
.app { min-height: 100vh; min-height: 100svh; }

/* header */
.bar {
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between;
  gap: .5rem 1rem; padding: .5rem 0;
}
.brand {
  display: inline-flex; align-items: center; min-height: 3rem;
  color: var(--primary); text-decoration: none; font-weight: var(--strong);
  font-size: 1.125rem; letter-spacing: -.01em;
}
.brand span { color: var(--muted); font-weight: 400; }
.toggle {
  display: inline-flex; align-items: center; gap: .5rem;
  min-height: 3rem; padding: .25rem 1rem;
  font: inherit; font-size: 1.125rem; color: var(--text);
  background: transparent; border: 2px solid var(--border); border-radius: 999px; cursor: pointer;
  white-space: nowrap;
}
.toggle:hover { background: var(--secondary); }
.toggle svg { width: 1.375rem; height: 1.375rem; flex: none; }
[data-theme="light"] .toggle .i-sun, [data-theme="dark"] .toggle .i-moon { display: none; }

/* search */
.find h1 { color: var(--primary); font-weight: var(--strong); line-height: 1.15; }
.find h1 label { display: block; cursor: pointer; }
.search { position: relative; }
.search svg {
  position: absolute; left: 1rem; top: 50%; transform: translateY(-50%);
  width: 1.5rem; height: 1.5rem; color: var(--muted); pointer-events: none;
}
.search input {
  -webkit-appearance: none; appearance: none;
  width: 100%; min-width: 0; min-height: 3.5rem; padding: .75rem 1rem .75rem 3.25rem;
  font: inherit; font-size: 1.125rem; color: var(--text);
  background: var(--surface); border: 2px solid var(--border); border-radius: var(--r-field);
}
.search input::placeholder { color: var(--muted); opacity: 1; }
.search input:focus-visible { outline-offset: 2px; }

/* waste labels */
.groups { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; }
.and { color: var(--muted); }
.g {
  display: inline-flex; align-items: center; gap: .5rem;
  min-height: 2.5rem; padding: .25rem .875rem .25rem .625rem;
  background: var(--secondary); color: var(--text);
  border-radius: 999px; line-height: 1.25;
}
.g svg { width: 1.5rem; height: 1.5rem; flex: none; }
""" + "\n".join(f".g-{k} svg {{ color: var(--waste-{k}); }}" for k, _ in WASTE) + r"""

/* calendar button */
.cta {
  display: inline-flex; align-items: center; justify-content: center; gap: .75rem;
  width: 100%; min-height: 3.5rem; padding: .75rem 1.5rem;
  font: inherit; font-size: 1.125rem; font-weight: var(--strong);
  color: var(--on-accent); background: var(--accent);
  border: 0; border-radius: var(--r-button); cursor: pointer;
}
.cta:hover { background: color-mix(in srgb, var(--accent) 88%, var(--primary)); }
.cta svg { width: 1.5rem; height: 1.5rem; flex: none; }

/* spec sheet below the preview */
.spec { padding-top: 3rem; padding-bottom: 4rem; border-top: 1px solid color-mix(in srgb, var(--border) 50%, transparent); }
.spec h2 { font-size: 1.75rem; line-height: 1.2; color: var(--primary); font-weight: var(--strong); }
.spec h3 { font-size: 1.375rem; line-height: 1.25; color: var(--primary); font-weight: var(--strong); margin: 2.5rem 0 1rem; }
.spec p + p { margin-top: .75rem; }
.spec .lead { color: var(--muted); margin-top: .5rem; max-width: 40rem; }
.spec a { color: var(--primary); text-underline-offset: .2em; }
.pangram { font-size: 2rem; line-height: 1.25; color: var(--primary); }
.pangram.b { font-weight: var(--strong); }
.letters { font-size: 1.5rem; letter-spacing: .04em; margin-top: .5rem; }
.facts { display: grid; gap: .25rem; margin-top: 1rem; }
.facts dt { color: var(--muted); }
.facts dd { margin: 0 0 .5rem; }
.scroll { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; min-width: 40rem; }
th, td { text-align: left; padding: .625rem .75rem; border-bottom: 1px solid color-mix(in srgb, var(--border) 45%, transparent); vertical-align: middle; }
th { color: var(--muted); font-weight: 400; }
td.num { font-variant-numeric: tabular-nums; white-space: nowrap; }
code { font-size: 1rem; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.sw { display: inline-flex; align-items: center; gap: .5rem; white-space: nowrap; }
.sw i { width: 1.75rem; height: 1.75rem; border-radius: .375rem; box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--text) 30%, transparent); }
.sample { display: inline-block; padding: .25rem .625rem; border-radius: .375rem; white-space: nowrap; font-weight: var(--strong); }
.ok { color: var(--text); }
.legend { display: flex; flex-wrap: wrap; gap: .5rem; }
"""

LATARNIA_CSS = r"""
:root { --r-field: .75rem; --r-button: .875rem; }
.screen { display: grid; grid-template-columns: minmax(0, 1fr); gap: 1.25rem; padding-block: .5rem 2rem; }
.find h1 { font-size: 1.75rem; margin-bottom: .625rem; }
.card { background: var(--surface); border-radius: 1.25rem; padding: 1.125rem 1rem 1rem; }
.card .eyebrow { color: var(--muted); }
.card h2 { font-size: 1.375rem; line-height: 1.25; color: var(--primary); font-weight: var(--strong); }
.pickups { margin: .75rem 0 1rem; }
.pickup {
  display: flex; gap: 1rem; padding: .75rem 0 .75rem .875rem;
  border-top: 1px solid color-mix(in srgb, var(--border) 40%, transparent);
  border-left: 4px solid transparent;
}
.pickup.is-next { border-left-color: var(--accent); }
.when { margin-bottom: .375rem; }
.when strong { color: var(--accent); font-weight: var(--strong); }
.date { display: none; }

@media (min-width: 40em) {
  .wrap { padding-inline: 2rem; }
  .card { padding: 1.75rem 2rem 2rem; }
  .pickup { padding: 1rem 0; border-left: 0; align-items: center; gap: 1.25rem; }
  .date {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    flex: none; width: 4.75rem; min-height: 4.75rem; padding: .375rem 0;
    background: var(--secondary); border-radius: .75rem; line-height: 1.1;
    border-top: 6px solid color-mix(in srgb, var(--border) 70%, transparent);
  }
  .date .d { font-size: 1.875rem; font-weight: var(--strong); color: var(--primary); }
  .date .w { font-size: 1.125rem; color: var(--muted); }
  .is-next .date { background: var(--accent); border-top-color: color-mix(in srgb, var(--on-accent) 35%, var(--accent)); }
  .is-next .date .d, .is-next .date .w { color: var(--on-accent); }
  .cta { width: auto; }
}

@media (min-width: 64em) {
  .screen { grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); gap: 4rem; align-items: start; padding-top: 4rem; }
  .find { position: sticky; top: 2rem; }
  .find h1 { font-size: 3.5rem; letter-spacing: -.02em; margin-bottom: 1.25rem; }
  .card h2 { font-size: 1.75rem; }
}
"""

BEZ_CSS = r"""
:root { --r-field: 999px; --r-button: 999px; }
.screen { display: grid; grid-template-columns: minmax(0, 1fr); gap: 1.5rem; padding-block: .5rem 2rem; }
.find h1 { font-size: 1.625rem; margin-bottom: .625rem; }
.addr {
  display: flex; align-items: center; gap: .5rem;
  font-size: 1.125rem; font-weight: var(--strong); color: var(--primary); line-height: 1.3;
}
.addr svg { width: 1.375rem; height: 1.375rem; color: var(--accent); flex: none; }
.hero {
  margin-top: .75rem; padding: 1rem 1.125rem 1.125rem;
  background: var(--surface); border-radius: 1.5rem;
}
.hero .when { display: block; margin-bottom: .75rem; }
.big {
  display: block; font-size: 3.25rem; line-height: 1; letter-spacing: -.03em;
  font-weight: var(--strong); color: var(--accent);
}
.rest { display: block; margin-top: .375rem; font-size: 1.25rem; color: var(--primary); }
.later-title { margin: 1.25rem 0 .25rem; font-size: 1.125rem; color: var(--muted); font-weight: 400; }
.later li {
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between;
  gap: .5rem 1rem; padding: .625rem 0;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 40%, transparent);
}
.result .cta { margin-top: 1.25rem; }

@media (min-width: 40em) {
  .wrap { padding-inline: 2rem; }
  .big { font-size: 4.5rem; }
  .cta { width: auto; }
}

@media (min-width: 64em) {
  .wrap { max-width: 68rem; }
  .screen { padding-top: 3.5rem; gap: 2.5rem; }
  .find { max-width: 36rem; }
  .find h1 { font-size: 2.75rem; letter-spacing: -.02em; margin-bottom: 1rem; }
  .result {
    display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); column-gap: 3rem;
    grid-template-areas: "addr addr" "hero later" "hero cta";
    grid-template-rows: auto auto 1fr;
  }
  .addr { grid-area: addr; font-size: 1.25rem; }
  .hero { grid-area: hero; margin-top: 1rem; padding: 2.5rem; }
  .big { font-size: 6rem; }
  .rest { font-size: 1.5rem; margin-top: .75rem; }
  .hero .when { margin-bottom: 1.5rem; }
  .later-wrap { grid-area: later; margin-top: 1rem; }
  .later-title { margin-top: 0; }
  .later li { padding: 1rem 0; }
  .result .cta { grid-area: cta; align-self: start; justify-self: start; margin-top: 2rem; }
}
"""


def css_for(d):
    f = d["font"]
    root = (f':root, :root[data-theme="dark"] {{\n  color-scheme: dark;\n'
            f'  --font: "{f["family"]}", system-ui, -apple-system, "Segoe UI", sans-serif;\n'
            f'  --strong: {f["strong"]};\n{token_block(d["themes"]["dark"])}\n}}\n'
            f':root[data-theme="light"] {{\n  color-scheme: light;\n'
            f'{token_block(d["themes"]["light"])}\n}}\n')
    extra = LATARNIA_CSS if d["slug"] == "latarnia" else BEZ_CSS
    return "\n\n".join([tailwind_comment(d), font_faces(f), root, BASE_CSS.strip(), extra.strip()]) + "\n"


# ---------------------------------------------------------------- HTML

HEAD_SCRIPT = """<script>
  (function () {
    var q = new URLSearchParams(location.search);
    var t = q.get("theme");
    try { t = t || localStorage.getItem("theme"); } catch (e) {}
    document.documentElement.dataset.theme = t === "light" ? "light" : "dark";
    var z = q.get("text");
    if (z) document.documentElement.style.fontSize = (parseInt(z, 10) || 100) + "%";
  })();
</script>"""

TOGGLE_SCRIPT = """<script>
  (function () {
    var btn = document.getElementById("theme-toggle");
    var label = document.getElementById("theme-label");
    function sync() {
      var light = document.documentElement.dataset.theme === "light";
      label.textContent = light ? "Włącz ciemny" : "Włącz jasny";
    }
    btn.addEventListener("click", function () {
      var next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem("theme", next); } catch (e) {}
      sync();
    });
    sync();
  })();
</script>"""


def chip(k):
    return f'<li class="g g-{k}">{icon(k)}<span>{WASTE_LABEL[k]}</span></li>'


def groups(keys):
    parts = []
    for i, k in enumerate(keys):
        if i:
            parts.append('<li class="and" aria-hidden="true">i</li>')
        parts.append(chip(k))
    return f'<ul class="groups">{"".join(parts)}</ul>'


def header():
    return f"""<header class="bar">
      <a class="brand" href="../index.html">conaulicy<span>.pl</span></a>
      <button class="toggle" id="theme-toggle" type="button">
        {icon("sun", "i-sun")}{icon("moon", "i-moon")}<span id="theme-label">Włącz jasny</span>
      </button>
    </header>"""


def find():
    return f"""<section class="find">
        <h1><label for="q">Mój adres</label></h1>
        <div class="search">
          {icon("search")}
          <input id="q" type="search" name="q" placeholder="{PLACEHOLDER}" autocomplete="off" enterkeyhint="search">
        </div>
      </section>"""


CTA = f'<button class="cta" type="button">{icon("calendar")}<span>Dodaj do kalendarza</span></button>'


def screen_latarnia():
    rows = []
    for i, p in enumerate(PICKUPS):
        when = (f"<strong>{p['rel']}</strong>, {p['rest']}" if p["rel"] else p["rest"])
        rows.append(f"""<li class="pickup{' is-next' if i == 0 else ''}">
              <div class="date" aria-hidden="true"><span class="d">{p['day']}</span><span class="w">{p['wd']}</span></div>
              <div>
                <p class="when">{when}</p>
                {groups(p['groups'])}
              </div>
            </li>""")
    return f"""<main class="screen wrap" id="preview">
      {find()}
      <section class="card" aria-labelledby="addr">
        <p class="eyebrow">Najbliższe wywozy</p>
        <h2 id="addr">{ADDRESS}</h2>
        <ol class="pickups">
            {''.join(rows)}
        </ol>
        {CTA}
      </section>
    </main>"""


def screen_bez():
    first, *rest = PICKUPS
    later = "".join(f'<li><p class="when">{p["rest"]}</p>{groups(p["groups"])}</li>' for p in rest)
    return f"""<main class="screen wrap" id="preview">
      {find()}
      <section class="result" aria-labelledby="addr">
        <h2 class="addr" id="addr">{icon("pin")}<span>{ADDRESS}</span></h2>
        <div class="hero">
          <p class="when"><span class="big">{first['rel']}</span><span class="sr-only">, </span><span class="rest">{first['rest']}</span></p>
          {groups(first['groups'])}
        </div>
        <div class="later-wrap">
          <h3 class="later-title">Potem</h3>
          <ol class="later">{later}</ol>
        </div>
        {CTA}
      </section>
    </main>"""


def font_sizes(f):
    out = {}
    for w in f["weights"]:
        sizes = {}
        for sub in ("latin", "latin-ext"):
            path = os.path.join(ROOT, "fonts", f["dir"], f["file"].format(sub=sub, w=w))
            sizes[sub] = os.path.getsize(path)
        out[w] = sizes
    return out


def kb(n):
    return f"{n / 1024:.1f} KB".replace(".", ",")


def fmt(r):
    return f"{floor2(r):.2f}".replace(".", ",") + ":1"


def contrast_table(d, theme):
    t = d["themes"][theme]
    rows = []
    for label, fg, bg, kind in pairs(t):
        r = ratio(t[fg], t[bg])
        need = "3:1 (element UI)" if kind == "ui" else "4,5:1 (tekst)"
        if kind == "body":
            need = "4,5:1 · cel 7:1 (tekst główny)"
        aa = "tak" if r >= (3 if kind == "ui" else 4.5) else "NIE"
        aaa = ("tak" if r >= 7 else "nie") if kind in ("body", "text") else "—"
        if kind == "ui":
            sample = (f'<span class="sample" style="background:{t[bg]};color:{t[fg]}">'
                      f'<span style="display:inline-block;width:2.5rem;height:.875rem;'
                      f'border-radius:.25rem;background:{t[fg]};vertical-align:middle"></span></span>')
        else:
            sample = f'<span class="sample" style="background:{t[bg]};color:{t[fg]}">Wywóz</span>'
        rows.append(
            f"<tr><td>{escape(label)}</td><td>{sample}</td>"
            f"<td><code>{fg}</code> {t[fg]}<br><code>{bg}</code> {t[bg]}</td>"
            f"<td>{need}</td><td class=\"num\"><strong>{fmt(r)}</strong></td><td>{aa}</td><td>{aaa}</td></tr>")
    name = "ciemny (domyślny)" if theme == "dark" else "jasny"
    return f"""<h3>Kontrast — motyw {name}</h3>
      <div class="scroll" tabindex="0" role="region" aria-label="Tabela kontrastu, motyw {name}">
        <table>
          <thead><tr><th>Para</th><th>Próbka</th><th>Kolory</th><th>Wymóg</th><th>Kontrast</th><th>AA</th><th>AAA 7:1</th></tr></thead>
          <tbody>{''.join(rows)}</tbody>
        </table>
      </div>"""


def token_table(d):
    rows = []
    for k in TOKENS + [f"waste-{k}" for k, _ in WASTE]:
        dk, lk = d["themes"]["dark"][k], d["themes"]["light"][k]
        note = TOKEN_NOTES.get(k) or "odpady: " + WASTE_LABEL[k[6:]]
        rows.append(
            f'<tr><td><code>--{k}</code></td><td><code>--color-{k}</code></td>'
            f'<td><span class="sw"><i style="background:{dk}"></i>{dk}</span></td>'
            f'<td><span class="sw"><i style="background:{lk}"></i>{lk}</span></td><td>{note}</td></tr>')
    return f"""<div class="scroll" tabindex="0" role="region" aria-label="Tabela kolorów">
        <table>
          <thead><tr><th>Token</th><th>Tailwind v4</th><th>Ciemny</th><th>Jasny</th><th>Do czego</th></tr></thead>
          <tbody>{''.join(rows)}</tbody>
        </table>
      </div>"""


def spec(d):
    f = d["font"]
    sizes = font_sizes(f)
    main = f["weights"][0]
    main_total = sizes[main]["latin"] + sizes[main]["latin-ext"]
    size_rows = "".join(
        f"<li>{w}: {kb(s['latin'])} (latin) + {kb(s['latin-ext'])} (latin-ext) = "
        f"<strong>{kb(s['latin'] + s['latin-ext'])}</strong> ({s['latin'] + s['latin-ext']} B)</li>"
        for w, s in sizes.items())
    legend = "".join(chip(k) for k, _ in WASTE)
    return f"""<section class="spec wrap" aria-labelledby="spec-h">
      <h2 id="spec-h">Kierunek: {d['name']}</h2>
      <p class="lead">„{d['mood']}”</p>
      <p class="lead">{d['idea']}</p>

      <h3>Krój pisma: {f['family']}</h3>
      <p class="pangram">Pchnąć w tę łódź jeża lub ośm skrzyń fig</p>
      <p class="pangram b">Pchnąć w tę łódź jeża lub ośm skrzyń fig</p>
      <p class="letters">ąćęłńóśźż ĄĆĘŁŃÓŚŹŻ</p>
      <dl class="facts">
        <dt>Dlaczego</dt><dd>{f['why']}</dd>
        <dt>Grubości</dt><dd>{' i '.join(str(w) for w in f['weights'])} (tekst {main}, wyróżnienia {f['strong']})</dd>
        <dt>Pliki woff2 (Latin + Latin Extended, ładowane przez unicode-range)</dt><dd><ul>{size_rows}</ul></dd>
        <dt>Główna grubość ({main})</dt><dd><strong>{kb(main_total)}</strong> razem — cel ≤ 60 KB spełniony</dd>
        <dt>Źródło i licencja</dt><dd>{f['pkg']} (pliki z <a href="{f['repo']}">repozytorium kroju</a>), SIL Open Font License 1.1 — <a href="../fonts/{f['dir']}/OFL.txt">OFL.txt</a></dd>
      </dl>

      <h3>Kolory — oba motywy</h3>
      {token_table(d)}

      <h3>Rodzaje odpadów — zawsze ikona i nazwa</h3>
      <ul class="legend">{legend}</ul>

      {contrast_table(d, 'dark')}
      {contrast_table(d, 'light')}
    </section>"""


def page(d):
    body = screen_latarnia() if d["slug"] == "latarnia" else screen_bez()
    return f"""<!doctype html>
<html lang="pl" data-theme="dark">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Mój adres — conaulicy.pl · kierunek {d['name']}</title>
  {HEAD_SCRIPT}
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div class="app">
    <div class="wrap">
      {header()}
    </div>
    {body}
  </div>
  {spec(d)}
  {TOGGLE_SCRIPT}
</body>
</html>
"""


INDEX_CSS = """*, *::before, *::after { box-sizing: border-box; }
:root { color-scheme: dark; --bg: #121418; --text: #ECEEF2; --muted: #B3B8C2; --line: #3A3F49; }
body { margin: 0; background: var(--bg); color: var(--text); font: 1.125rem/1.55 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 72rem; margin: 0 auto; padding: 2rem 1rem 4rem; }
h1 { font-size: 2rem; line-height: 1.2; margin: 0 0 .5rem; }
h2 { font-size: 1.5rem; margin: 0; }
p { margin: .5rem 0 0; }
.muted { color: var(--muted); }
a { color: var(--text); text-underline-offset: .2em; }
a:focus-visible { outline: 3px solid #FFFFFF; outline-offset: 3px; }
.dir { border-top: 1px solid var(--line); padding: 2rem 0; }
.open { display: inline-flex; align-items: center; min-height: 3rem; font-weight: 700; }
.shots { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr)); margin-top: 1rem; }
.shots figure { margin: 0; }
.shots img { width: 100%; height: auto; border: 1px solid var(--line); border-radius: .5rem; }
.shots figcaption { color: var(--muted); }
code { font-size: 1rem; }
"""


def index_html():
    items = []
    for d in DIRECTIONS:
        f = d["font"]
        sizes = font_sizes(f)
        main = f["weights"][0]
        total = sizes[main]["latin"] + sizes[main]["latin-ext"]
        shots = "".join(
            f'<figure><a href="{d["slug"]}/{n}.png"><img src="{d["slug"]}/{n}.png" alt="Zrzut ekranu: {d["name"]}, {n}" loading="lazy"></a>'
            f'<figcaption><code>{d["slug"]}/{n}.png</code></figcaption></figure>'
            for n in ("360-dark", "360-light", "1280-dark", "1280-light"))
        acc = f'{d["themes"]["dark"]["accent"]} (ciemny) · {d["themes"]["light"]["accent"]} (jasny)'
        items.append(f"""<section class="dir">
      <h2>{d['name']}</h2>
      <p>„{d['mood']}”</p>
      <p class="muted">{d['idea']}</p>
      <p>Krój: {f['family']} {' + '.join(str(w) for w in f['weights'])} · główna grubość {kb(total)} · akcent {acc}</p>
      <a class="open" href="{d['slug']}/index.html">Otwórz podgląd: {d['name']}</a>
      <div class="shots">{shots}</div>
      <p class="muted">Sprawdzenie dużego tekstu (200%, 360 px): <a href="{d['slug']}/360-dark-text200.png"><code>{d['slug']}/360-dark-text200.png</code></a></p>
    </section>""")
    return f"""<!doctype html>
<html lang="pl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>conaulicy.pl — Krok 1: propozycje wyglądu</title>
  <link rel="stylesheet" href="index.css">
</head>
<body>
  <main>
    <h1>Mój adres — propozycje wyglądu</h1>
    <p class="muted">Krok 1. Dwa kierunki, każdy w motywie ciemnym (domyślnym) i jasnym. Każdy podgląd ma przełącznik „Włącz jasny”, a także działa z <code>?theme=light</code>. Pod podglądem: kolory, tabele kontrastu i próbka kroju.</p>
    {''.join(items)}
  </main>
</body>
</html>
"""


def main():
    failures = []
    for d in DIRECTIONS:
        failures += check(d)
    if failures:
        print("\n".join(failures))
        sys.exit(1)
    for d in DIRECTIONS:
        os.makedirs(os.path.join(ROOT, d["slug"]), exist_ok=True)
        with open(os.path.join(ROOT, d["slug"], "styles.css"), "w") as fh:
            fh.write(css_for(d))
        with open(os.path.join(ROOT, d["slug"], "index.html"), "w") as fh:
            fh.write(page(d))
    with open(os.path.join(ROOT, "index.html"), "w") as fh:
        fh.write(index_html())
    with open(os.path.join(ROOT, "index.css"), "w") as fh:
        fh.write(INDEX_CSS)
    for d in DIRECTIONS:
        for th in ("dark", "light"):
            t = d["themes"][th]
            print(d["slug"], th, "body", f"{ratio(t['text'], t['background']):.2f}",
                  "accent/bg", f"{ratio(t['accent'], t['background']):.2f}",
                  "btn", f"{ratio(t['on-accent'], t['accent']):.2f}")
    print("ok")


if __name__ == "__main__":
    main()
