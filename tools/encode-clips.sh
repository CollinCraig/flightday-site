#!/bin/sh
# Encode the site's feature clips with ffmpeg (runs on the Linux build box, niced, two threads):
# H.264 MP4 (fast start, muted) + VP9 WebM + a WebP poster, 1280 × 720.
#
#   tools/encode-clips.sh frames <frames-root> <out-dir> <clip> <poster-s>
#       <frames-root>/<clip>/take1/00000.jpg… (and take2… if any) at 30 fps, from tools/record-clips.cjs.
#       Takes are joined with a short dip through black.
#   tools/encode-clips.sh sim <in.mov> <out-dir> <clip> <poster-s> <start:dur[,start:dur…]> <crop-top-px>
#       A simulator recording: the chosen segments (joined with a dip), the status bar cropped off, the screen
#       scaled to 680 px tall with rounded corners and centred on a Night (#0A0E1A) canvas.
#   tools/encode-clips.sh sheet <in.mov> <out.png>
#       One frame per second, tiled, to pick the trim points of a simulator recording.
set -eu
FF="nice -n 19 ffmpeg -hide_banner -loglevel error -y -threads 2 -filter_threads 1 -filter_complex_threads 1"
X264="-c:v libx264 -preset slow -crf 22 -maxrate 2000k -bufsize 4000k -profile:v high -pix_fmt yuv420p -movflags +faststart -an -map_metadata -1 -map_chapters -1 -fflags +bitexact -flags:v +bitexact -threads 2"
VP9="-c:v libvpx-vp9 -b:v 0 -crf 38 -row-mt 1 -deadline good -cpu-used 4 -pix_fmt yuv420p -an -map_metadata -1 -map_chapters -1 -fflags +bitexact -flags:v +bitexact -threads 2"
D=0.27   # dip length per side, seconds

finish() {   # <out-dir> <clip> <poster-s>: WebM and poster from the MP4's source filter graph already written
  $FF -ss "$3" -i "$1/$2.mp4" -frames:v 1 -map_metadata -1 -c:v libwebp -quality 82 "$1/$2.webp"
  ls -l "$1/$2.mp4" "$1/$2.webm" "$1/$2.webp" | awk '{printf "%s %.2f MB\n", $NF, $5/1048576}'
}

case "$1" in
frames)
  FR=$2; OUT=$3; NAME=$4; PT=$5; mkdir -p "$OUT"
  set -- ; i=0; graph=""; labels=""
  takes=$(ls -d "$FR/$NAME"/take* | sort)
  last=$(echo "$takes" | wc -l)
  for t in $takes; do
    set -- "$@" -framerate 30 -i "$t/%05d.jpg"
    n=$(ls "$t" | wc -l); len=$(awk "BEGIN{print $n/30}")
    f="scale=1280:720:flags=lanczos,format=yuv420p"
    [ "$i" -gt 0 ] && f="$f,fade=t=in:st=0:d=$D"
    [ "$((i + 1))" -lt "$last" ] && f="$f,fade=t=out:st=$(awk "BEGIN{print $len-$D}"):d=$D"
    graph="$graph[$i:v]$f[v$i];"; labels="$labels[v$i]"; i=$((i + 1))
  done
  graph="${graph}${labels}concat=n=$i:v=1:a=0[v]"
  $FF "$@" -filter_complex "$graph" -map "[v]" -r 30 $X264 "$OUT/$NAME.mp4"
  $FF "$@" -filter_complex "$graph" -map "[v]" -r 30 $VP9 "$OUT/$NAME.webm"
  finish "$OUT" "$NAME" "$PT" ;;
sim)
  # <segments> is start:duration[,start:duration…] in seconds; segments are joined with a short dip through black.
  IN=$2; OUT=$3; NAME=$4; PT=$5; SEGS=$6; TOP=$7; mkdir -p "$OUT"
  W=$(ffprobe -v error -select_streams v:0 -show_entries stream=width -of csv=p=0 "$IN")
  H=$(ffprobe -v error -select_streams v:0 -show_entries stream=height -of csv=p=0 "$IN")
  PH=680; PW=$(( (W * PH / (H - TOP)) / 2 * 2 )); R=46
  MASK="$OUT/.mask-$NAME.png"
  $FF -f lavfi -i "color=c=white:s=${PW}x${PH}" -frames:v 1 \
    -vf "format=gray,geq=lum='if(lte(pow(max(0\,max($R-X\,X-($PW-1-$R)))\,2)+pow(max(0\,max($R-Y\,Y-($PH-1-$R)))\,2)\,$R*$R)\,255\,0)'" "$MASK"
  # fps=30 comes before trim: a simulator recording is variable-rate, and trimming it first can keep an earlier held frame.
  n=$(echo "$SEGS" | tr ',' '\n' | wc -l); i=0; graph="[0:v]fps=30,split=$n"; parts=""; labels=""; total=0
  for k in $(seq 0 $((n - 1))); do graph="$graph[a$k]"; done; graph="$graph;"
  for seg in $(echo "$SEGS" | tr ',' ' '); do
    st=${seg%%:*}; du=${seg##*:}; f="trim=start=$st:duration=$du,setpts=PTS-STARTPTS"
    [ "$i" -gt 0 ] && f="$f,fade=t=in:st=0:d=$D"
    [ "$((i + 1))" -lt "$n" ] && f="$f,fade=t=out:st=$(awk "BEGIN{print $du-$D}"):d=$D"
    parts="$parts[a$i]$f[s$i];"; labels="$labels[s$i]"; total=$(awk "BEGIN{print $total+$du}"); i=$((i + 1))
  done
  graph="$graph$parts${labels}concat=n=$n:v=1:a=0,crop=iw:ih-$TOP:0:$TOP,scale=$PW:$PH:flags=lanczos,format=yuva420p[ph];[1:v]format=gray,scale=$PW:$PH[m];[ph][m]alphamerge[pha];color=c=0x0A0E1A:s=1280x720:r=30:d=$total[bg];[bg][pha]overlay=(W-w)/2:(H-h)/2:shortest=1,format=yuv420p[v]"
  $FF -i "$IN" -loop 1 -i "$MASK" -filter_complex "$graph" -map "[v]" -t "$total" $X264 "$OUT/$NAME.mp4"
  $FF -i "$IN" -loop 1 -i "$MASK" -filter_complex "$graph" -map "[v]" -t "$total" $VP9 "$OUT/$NAME.webm"
  rm -f "$MASK"
  finish "$OUT" "$NAME" "$PT" ;;
sheet)
  $FF -i "$2" -vf "fps=1,scale=200:-2,drawtext=text='%{pts\:hms}':x=6:y=6:fontsize=18:fontcolor=yellow,tile=10x4" -frames:v 1 "$3" 2>/dev/null \
    || $FF -i "$2" -vf "fps=1,scale=200:-2,tile=10x4" -frames:v 1 "$3" ;;
*) echo "usage: $0 frames|sim|sheet …"; exit 2 ;;
esac
