#!/bin/sh
# Builds the two web fonts in assets/fonts from the full TTFs (also used by
# the PDF): Latin-1 + Latin Extended-A (every Polish letter) and common
# punctuation, unhinted, as WOFF2. One file per weight, so a page loads two
# fonts (~25 KB), not four. Needs fonttools and brotli:
#   pip install fonttools==4.60.1 brotli==1.1.0
set -eu
cd "$(dirname "$0")/../assets/fonts"
UNICODES="U+0000-017F,U+02C6,U+02C7,U+02D8-02DD,U+2000-206F,U+20AC,U+2122,U+2190-2193,U+2212,U+2215,U+FEFF,U+FFFD"
for pair in Regular:400 Bold:700; do
  pyftsubset "AtkinsonHyperlegibleNext-${pair%%:*}.ttf" \
    --unicodes="$UNICODES" --no-hinting --desubroutinize --flavor=woff2 \
    --output-file="atkinson-hyperlegible-next-${pair##*:}.woff2"
done
