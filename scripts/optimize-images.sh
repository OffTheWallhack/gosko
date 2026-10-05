#!/usr/bin/env bash
# Zmenší obrázky v img/ pre web (macOS). Dá sa spúšťať opakovane, hotové súbory preskočí.
#   1. img/*.webp nad MAX px (dlhšia strana) zmenší na MAX px.
#   2. img/*.webp nad BUDGET_KB znova zakóduje s nižšou kvalitou (cieľ: žiadny obrázok nad 250 KB).
#   3. logo.webp zmenší na LOGO px; originál ostane ako logo-640.webp pre veľké logo na úvode (srcset).
#   4. Vyrobí img/og-image.jpg 1200×630 pre zdieľanie na sociálnych sieťach (og:image).
# sips (súčasť macOS) meria a mení rozmery; WebP zapisovať nevie, preto kódovanie robí cwebp (brew install webp).
set -euo pipefail

MAX=${MAX:-1600}
BUDGET_KB=${BUDGET_KB:-250}
QUALITY=${QUALITY:-78}
LOGO=${LOGO:-256}
OG_SRC=${OG_SRC:-ba-podium.webp}

cd "$(dirname "$0")/../img"
command -v sips >/dev/null || { echo "Chýba sips (beží len na macOS)." >&2; exit 1; }
command -v cwebp >/dev/null || { echo "Chýba cwebp: brew install webp" >&2; exit 1; }

tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
dims() { sips -g pixelWidth -g pixelHeight "$1" | awk '/pixelWidth/{w=$2} /pixelHeight/{h=$2} END{print w, h}'; }
kb() { echo $(( ($(stat -f%z "$1") + 1023) / 1024 )); }
# encode <png> <webp> <quality>: lossless alfa ostane, inak stratovo
encode() { cwebp -quiet -mt -q "$3" -alpha_q 100 -m 6 "$1" -o "$2"; }

# 3. logo (pred krokom 1, aby sa originál zachoval)
if [ -f logo.webp ]; then
  read -r w h < <(dims logo.webp)
  if [ "$w" -gt "$LOGO" ]; then
    [ -f logo-640.webp ] || cp logo.webp logo-640.webp
    sips -s format png -Z "$LOGO" logo.webp --out "$tmp/logo.png" >/dev/null
    encode "$tmp/logo.png" logo.webp 90
    echo "logo.webp: ${w}x${h} -> $(dims logo.webp | tr ' ' x), $(kb logo.webp) KB (originál: logo-640.webp)"
  fi
fi

# 1. a 2. fotky
for f in *.webp; do
  [ "$f" = logo.webp ] || [ "$f" = logo-640.webp ] && continue
  read -r w h < <(dims "$f")
  long=$(( w > h ? w : h ))
  if [ "$long" -gt "$MAX" ]; then
    sips -s format png -Z "$MAX" "$f" --out "$tmp/x.png" >/dev/null
    encode "$tmp/x.png" "$f" "$QUALITY"
    echo "$f: ${w}x${h} -> $(dims "$f" | tr ' ' x), $(kb "$f") KB"
  elif [ "$(kb "$f")" -gt "$BUDGET_KB" ]; then
    # kvalitu znižuje po krokoch, kým sa obrázok nezmestí do rozpočtu (najnižšie 60)
    before=$(kb "$f")
    sips -s format png "$f" --out "$tmp/x.png" >/dev/null
    for q in $(seq "$QUALITY" -4 60); do
      encode "$tmp/x.png" "$tmp/x.webp" "$q"
      if [ "$(kb "$tmp/x.webp")" -le "$BUDGET_KB" ]; then mv "$tmp/x.webp" "$f"; echo "$f: ${before} KB -> $(kb "$f") KB (q $q)"; break; fi
    done
  fi
done

# 4. obrázok na zdieľanie
if [ ! -f og-image.jpg ] && [ -f "$OG_SRC" ]; then
  sips -s format jpeg -s formatOptions 82 --resampleWidth 1200 "$OG_SRC" --out "$tmp/og.jpg" >/dev/null
  sips --cropToHeightWidth 630 1200 "$tmp/og.jpg" --out og-image.jpg >/dev/null
  echo "og-image.jpg: $(dims og-image.jpg | tr ' ' x), $(kb og-image.jpg) KB (z $OG_SRC)"
fi

over=$(find . -maxdepth 1 -type f \( -name '*.webp' -o -name '*.jpg' -o -name '*.png' \) -size +"${BUDGET_KB}"k -print)
[ -z "$over" ] && echo "OK: žiadny obrázok v img/ nemá nad ${BUDGET_KB} KB." || { echo "Nad ${BUDGET_KB} KB:"; echo "$over"; }
