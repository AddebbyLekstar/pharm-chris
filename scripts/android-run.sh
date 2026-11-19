#!/usr/bin/env bash
# Android-box gate: build, serve, drive the real emulator WebView over CDP.
# Invoked by scripts/instabox-gate.sh with the android runner.
# Single-line commands only: exec rejects multi-line command strings.
set -u
cd "$(cd "$(dirname "$0")/.." && pwd)" || exit 3
echo "REPO=$(pwd)"

npm ci >/tmp/ci.log 2>&1; echo "CI_EXIT=$?"
npm run build >/tmp/build.log 2>&1; echo "BUILD_EXIT=$?"; tail -3 /tmp/build.log
echo "ARTIFACT_MARKERS=$(grep -l terrazzo dist/assets/*.js 2>/dev/null | wc -l)"

pkill -f "vite preview" >/dev/null 2>&1
sleep 1
nohup npx vite preview --port 4173 --host 127.0.0.1 --strictPort >/tmp/preview.log 2>&1 &
sleep 8
echo "PREVIEW_HTTP=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:4173/)"

adb start-server >/dev/null 2>&1
echo "DEVICES=$(adb devices | grep -c emulator)"
adb reverse tcp:4173 tcp:4173
# ANGLE must be forced or WebView segfaults in libwebviewchromium.so before the page loads.
adb shell 'echo "_ --use-angle=swiftshader --enable-unsafe-swiftshader --disable-gpu-sandbox" > /data/local/tmp/webview-command-line'
adb shell am force-stop org.chromium.webview_shell
adb shell am start -n org.chromium.webview_shell/.WebViewBrowserActivity -d 'http://localhost:4173/?mode=arcade' >/dev/null
sleep 15

SOCK=$(adb shell cat /proc/net/unix | grep -o 'webview_devtools_remote_[0-9]*' | head -1 | tr -d '\r')
echo "SOCK=$SOCK"
[ -z "$SOCK" ] && { echo "no webview devtools socket"; }
adb forward tcp:9222 localabstract:"$SOCK"
echo "CDP_TITLE=$(curl -s --max-time 10 http://127.0.0.1:9222/json | head -c 160)"

rm -rf /data/home/check-out
mkdir -p /data/home/check-out
cp -f /tmp/build.log /tmp/preview.log /data/home/check-out/ 2>/dev/null
node scripts/check-android.mjs --cdp http://127.0.0.1:9222 --url 'http://localhost:4173/?mode=arcade' > /data/home/check-out/android-check.log 2>&1
echo "ANDROID_EXIT=$?"
tail -25 /data/home/check-out/android-check.log
echo DONE
