# Build verification

Every build that is called finished is verified on real hardware before it is pushed
or deployed. The rule is fixed: **all four Instabox sandboxes**, two PC and two
Android, on the exact artifact that ships.

A green `npm test` is a floor, not a proof. The suite has never once caught a HUD
overlap or a shelf parked off screen, and both of those shipped in a commit
titled "fit the shop to portrait width".

## The four boxes

| Sandbox | Template | What it proves |
|---|---|---|
| `hermes` | `agent-browser` (4 vCPU / 8 GB) | clean Linux build, unit suite, headless Chromium layout gate, perf probe |
| `hermes2` | `agent-browser` | the same, on a second machine: the run reproduces rather than depending on one box's state |
| `hermesandroid` | `android` (Android 14 emulator) | real Android WebView, touch viewport, touch copy, GPU emulation path |
| `hermesandroid2` | `android` | the same on a second emulator |

All four build the same bundle. Compare the hashed asset name between boxes before
believing any of them: if `dist/index.html` references a different `assets/index-*.js`
than the build you inspected locally, you verified something else.

## PC boxes

```bash
instabox resume <box>
instabox exec <box> -- 'rm -rf /data/home/<repo>-check; mkdir -p /data/home/check-out'
instabox push <box> "C:/Users/<user>/<repo>" "/data/home/<repo>-check"
instabox exec --background <box> --cwd '/data/home/<repo>-check' -- '
  npm ci >/dev/null 2>&1; npm run build 2>&1 | tail -4; npx vitest run 2>&1 | tail -5
  nohup npx vite preview --port 4173 --host 127.0.0.1 --strictPort >/tmp/preview.log 2>&1 &
  sleep 6
  node scripts/check-mobile.mjs > /data/home/check-out/pc-mobile.json 2>&1; echo "MOBILE_EXIT=$?"
  node scripts/instabox-check.mjs > /data/home/check-out/pc-check.json 2>&1; echo "CHECK_EXIT=$?"'
instabox pull <box> /data/home/check-out "C:/Users/<user>/<repo>/instabox-check/<tag>"
```

## Android boxes

Android WebView crashes on this emulator at startup unless ANGLE is forced to
SwiftShader. Write the WebView command line first, or the app dies with a native
SIGSEGV inside `libwebviewchromium.so` before any page loads:

```bash
adb shell 'echo "_ --use-angle=swiftshader --enable-unsafe-swiftshader --disable-gpu-sandbox" > /data/local/tmp/webview-command-line'
adb reverse tcp:4173 tcp:4173          # the device reaches the box's server
adb shell am start -n org.chromium.webview_shell/.WebViewBrowserActivity \
  -d 'http://localhost:4173/?mode=arcade'
```

The emulator cannot reach `10.0.2.2` on this template; `adb reverse` is the way in.

Drive it over CDP. Playwright's `connectOverCDP` fails against Android WebView
(`Protocol error (Browser.setDownloadBehavior): Browser context management is not
supported`), so `scripts/check-android.mjs` speaks the page-level protocol directly
over `WebSocket`:

```bash
sock=$(adb shell cat /proc/net/unix | grep -o 'webview_devtools_remote_[0-9]*' | head -1 | tr -d '\r')
adb forward tcp:9222 localabstract:$sock
curl -s http://127.0.0.1:9222/json | head -c 200      # title must be the app, not "Webpage not available"
node scripts/check-android.mjs --cdp http://127.0.0.1:9222
```

## What the gates assert

`scripts/check-mobile.mjs` (7 viewports: 320, 360, 390, 414, 768, 1280, 1920) and
`scripts/check-android.mjs` (one real device viewport) fail on:

- any intersection between the hint, the INVEST button and the mode switcher;
- horizontal overflow (`scrollWidth > innerWidth`);
- a HUD element outside the viewport;
- a player rendered under 38 px tall;
- any of the six trigger zones not visible while the player stands in it;
- any console or page error.

`scripts/instabox-check.mjs` additionally drives the loop on a PC box: three
dock → shelf → counter rounds, cash and served deltas, a save/reload round trip, and
a 6×-throttled phone pass.

## Result of record — 2026-11-18, bundle `assets/index-ChqAL9nf.js`

| Box | Build | Tests | Layout gate | Player | Draw calls | Errors |
|---|---|---|---|---|---|---|
| `hermes` | `index-ChqAL9nf.js` | 151/151 | pass (7 viewports) | 42–68 px | 76 max phone / 143 desktop | 0 |
| `hermes2` | `index-ChqAL9nf.js` | 151/151 | pass (7 viewports) | 42–68 px | 76 max phone / 147 desktop | 0 |
| `hermesandroid` | same | — | pass (360×495) | 43 px | 70 | 0 |
| `hermesandroid2` | same | — | pass (360×495) | 43 px | 70 | 0 |

The Android frame time on the emulator (p50 66.7 ms) is SwiftShader software
rendering. It is not evidence about a real phone GPU, and should not be quoted as
performance.
