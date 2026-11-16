#!/bin/sh
# Release flightday.app: build, check, deploy to Cloudflare Pages, confirm it answers, record the release.
# Deploy in batches: one release = one new dated entry at the top of CHANGELOG.md.
#   tools/deploy.sh            production (branch main), then records the release in tools/released.json
#   tools/deploy.sh --preview  the preview branch (https://preview.flightday.pages.dev); records nothing
set -eu
cd "$(dirname "$0")/.."
BRANCH=main; URL=https://flightday.app/
[ "${1:-}" = "--preview" ] && { BRANCH=preview; URL=https://preview.flightday.pages.dev/; }
python3 tools/build-pages.py >/dev/null
node tools/retire-assets.mjs   # deleted assets get a 404 rule (tools/retired-assets.txt)
node tools/check-site.mjs
# Freshness is advisory; privacy and site checks above remain hard gates.
if node video/scripts/freshness-check.mjs; then
  echo "✓ published-video freshness check passed"
else
  echo "WARNING: published-video freshness check failed; include stale outputs in the release report"
fi
node ../oss/privacy-guard/guard.mjs public --fail-on=error
node tools/probe-media.mjs --retired-only
# Links listed in private/site-private.json "checkBeforeDeploy" go live only while they answer 200.
if [ -f private/site-private.json ]; then
  for u in $(node -e "for (const u of (JSON.parse(require('fs').readFileSync('private/site-private.json','utf8')).checkBeforeDeploy||[])) console.log(u)"); do
    if grep -rqs "href=\"$u\"" public; then
      c=$(curl -s -o /dev/null -w '%{http_code}' -L --max-time 15 "$u")
      [ "$c" = 200 ] || { echo "✗ public/ links to $u, which returns $c. Remove the link or wait."; exit 1; }
    fi
  done
fi
npx wrangler pages deploy public --project-name flightday --branch "$BRANCH" --commit-dirty=true
sleep 3
code=$(curl -s -o /dev/null -w '%{http_code}' "$URL")
[ "$code" = 200 ] || { echo "✗ $URL returned $code"; exit 1; }
echo "✓ $URL answers 200"
[ "$BRANCH" = main ] && node tools/check-site.mjs --record-release
# live probe: no analytics beacon, no-transform everywhere, demo files revalidate, edge copies within 5 minutes
if [ "$BRANCH" = main ]; then
  sleep 5
  node tools/probe-live.mjs || { echo "✗ post-deploy probe failed (the release is live: fix forward now)"; exit 1; }
  node tools/probe-media.mjs --retired-only
fi
exit 0
