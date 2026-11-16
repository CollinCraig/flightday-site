#!/bin/sh
# Privacy masks for published screenshots, applied after tools/build-assets.cjs (Linux build box, ffmpeg, niced).
# Each mask copies a blank patch of the same panel over the text, then the WebP sizes are rebuilt from the masked PNG.
#
#   tools/mask-shots.sh <public/assets/shots> [check-dir]
#
# - panel-home, panel-house, panel-night (Sample data): the background credit strip named a bundled wallpaper.
# - panel-space, ipad-space (Real): the ISS next-pass line, the local weather and the "visible SE/SSE" chip on a
#   Florida launch; together they hinted at where the home is. (panel-space's globe home marker is already
#   pixelated in build-assets.cjs.)
# With [check-dir], a crop of every masked area is written there for review.
set -eu
D=$1; CHK=${2:-}
FF="nice -n 19 ffmpeg -hide_banner -loglevel error -y -threads 2"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT

# mask <name> <op> …   op = del:x,y,w,h  (ffmpeg delogo: fill from the edges, so no scenery is copied)
#                       or cp:sx,sy,w,h>dx,dy (move a piece of the original, e.g. a chip that should line up)
mask() {
  name=$1; shift
  case "$*" in *cp:*) graph="[0:v]split=2[base][orig];"; last="base" ;; *) graph=""; last="0:v" ;; esac; i=0
  for m in "$@"; do
    case "$m" in
      del:*) r=${m#del:}; x=$(echo "$r" | cut -d, -f1); y=$(echo "$r" | cut -d, -f2); w=$(echo "$r" | cut -d, -f3); h=$(echo "$r" | cut -d, -f4)
             graph="$graph[$last]delogo=x=$x:y=$y:w=$w:h=$h[o$i];" ;;
      cp:*)  r=${m#cp:}; src=${r%%>*}; dst=${r##*>}
             sx=$(echo "$src" | cut -d, -f1); sy=$(echo "$src" | cut -d, -f2); w=$(echo "$src" | cut -d, -f3); h=$(echo "$src" | cut -d, -f4)
             graph="$graph[orig]crop=$w:$h:$sx:$sy[p$i];[$last][p$i]overlay=${dst%%,*}:${dst##*,}[o$i];" ;;
    esac
    last="o$i"; i=$((i + 1))
  done
  graph="${graph%;}"
  $FF -i "$D/$name-full.png" -filter_complex "$graph" -map "[$last]" -map_metadata -1 -frames:v 1 "$TMP/$name.png"
  cp "$TMP/$name.png" "$D/$name-full.png"
  for w in 1440 720; do
    $FF -i "$D/$name-full.png" -vf "scale=$w:-1:flags=lanczos" -map_metadata -1 -c:v libwebp -quality 80 -compression_level 6 -frames:v 1 "$D/$name-$w.webp"
  done
  if [ -n "$CHK" ]; then
    mkdir -p "$CHK"; j=0
    for m in "$@"; do
      r=${m#*:}; r=${r##*>}; case "$m" in cp:*) r=${m##*>},40,30 ;; esac
      x=$(echo "$r" | cut -d, -f1); y=$(echo "$r" | cut -d, -f2)
      x0=$(( x > 160 ? x - 160 : 0 )); y0=$(( y > 70 ? y - 70 : 0 ))
      $FF -i "$D/$name-full.png" -vf "crop=min(640\,iw-$x0):min(200\,ih-$y0):$x0:$y0" -frames:v 1 "$CHK/$name-$j.png"; j=$((j + 1))
    done
  fi
  echo "masked $name ($# areas)"
}

# Credit strip text (the strip itself is plain).
for n in panel-home panel-house panel-night; do mask "$n" del:14,1046,440,30; done
# Panel Space (1920 × 1080): next-pass box, weather, both chips on the Vulcan row; then its Go chip moves into line.
mask panel-space del:1600,182,276,72 del:1424,10,76,34 del:118,578,190,52 "cp:228,588,48,32>122,588"
# iPad Space (2752 × 2000): NEXT PASS line, weather, the VISIBLE SSE chip.
mask ipad-space del:1060,400,800,38 del:2462,16,124,46 del:250,1060,276,50
