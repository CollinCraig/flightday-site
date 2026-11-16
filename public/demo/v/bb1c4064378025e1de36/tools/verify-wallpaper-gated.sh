#!/bin/sh
# Caller must use the authorised heavy-job gate; see the repository load policy.
set -eu
cd /tmp/flightday-w16/source
for scene in sky stars earth weather; do
  convert "screenshots/wallpaper/$scene-poster.png" -resize '1920x1080!' -quality 72 "web/js/wallpaper/$scene.webp"
done
docker run --rm --network host --ipc host -v /tmp/flightday-w16/source:/work -v /tmp/flightday-fe-w11-p2/deps/node_modules:/deps -w /work -e NODE_PATH=/deps mcr.microsoft.com/playwright:v1.57.0-noble node tools/capture-wallpaper.cjs
docker run --rm --network host --ipc host -v /tmp/flightday-w16/source:/work -v /tmp/flightday-fe-w11-p2/deps/node_modules:/deps -w /work -e NODE_PATH=/deps mcr.microsoft.com/playwright:v1.57.0-noble node tools/test-ambient-layout.cjs
