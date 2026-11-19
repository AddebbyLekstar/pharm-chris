#!/usr/bin/env bash
# Runs the full verification gate inside an Instabox PC sandbox.
# Invoked as:  instabox exec --background <box> --cwd /data/home/pharm-chris-check -- 'bash ./scripts/box-run.sh'
# Kept as a file rather than an inline string: exec --background drops a
# multi-line command string (the job records an empty cmd and exits 0).
set -u
cd "$(cd "$(dirname "$0")/.." && pwd)" || exit 3
echo "REPO=$(pwd)"
echo "BOX=$(hostname) UTC=$(date -u +%FT%TZ)"

npm ci >/tmp/ci.log 2>&1; echo "CI_EXIT=$?"
npm run build >/tmp/build.log 2>&1; echo "BUILD_EXIT=$?"; tail -4 /tmp/build.log

# Prove the thing being tested is the new artifact, not a leftover server.
echo "ARTIFACT_MARKERS=$(grep -lc terrazzo dist/assets/*.js 2>/dev/null | wc -l)"
echo "DIST_JS=$(ls dist/assets/*.js 2>/dev/null | wc -l)"

npx vitest run >/tmp/test.log 2>&1; echo "TEST_EXIT=$?"; tail -5 /tmp/test.log

pkill -f "vite preview" >/dev/null 2>&1
sleep 1
nohup npx vite preview --port 4173 --host 127.0.0.1 --strictPort >/tmp/preview.log 2>&1 &
sleep 8
echo "PREVIEW_HTTP=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:4173/)"

rm -rf /data/home/check-out
mkdir -p /data/home/check-out
cp -f /tmp/build.log /tmp/test.log /tmp/preview.log /data/home/check-out/ 2>/dev/null

node scripts/check-mobile.mjs > /data/home/check-out/pc-mobile.json 2>&1; echo "MOBILE_EXIT=$?"
node scripts/instabox-check.mjs > /data/home/check-out/pc-check.json 2>&1; echo "CHECK_EXIT=$?"

echo DONE
