# Build verification

Every build that is called finished is verified on real hardware before it is pushed
or deployed. The rule is fixed: **all three Instabox sandboxes** — two PC-class and one
Android, plus a second Android — on the exact artifact that ships.

`hermes2` was dropped from the gate on 2026-11-26: it is one of the two Creator Studio
slots, and a slot that exists for a different product cannot be the second opinion on
this one. The replacement for its "does it reproduce on a second machine" role is
`hermesandroid2`, which builds the same bundle on different silicon.

A green `npm test` is a floor, not a proof. The suite has never once caught a HUD
overlap or a shelf parked off screen, and both of those shipped in a commit
titled "fit the shop to portrait width".

## Result of record — 2026-11-26, P4 tasks 4 and 5 (grade and phone composition)

Bundle `index-CwvW07XD.js` (373.16 kB, gzip 112.28), `three-B5ljPr9R.js` unchanged,
**307 tests in 34 files**, `tsc --noEmit` clean, commits `86740f1` + the docs commit.

**Not gated.** The Instabox API key (`key_agq2ob5x…`) was revoked mid-run on 2026-11-26
17:18–17:30: all three boxes failed at `resume` with `error revoked_key` before building
anything. Nothing in this section is box-verified; it is local Chrome and local pixel
measurement only. Re-issue a key at <https://dashboard.instabox.sh/dashboard/api-keys>
and write it to `C:\Users\hp\.config\instabox\credentials.json`, then re-run the three-box
gate before this section is treated as a landing record.

### Task 4 — grade (`GRADE` in `src/ui/arcade/art.ts`)

`v4: { exposure: 1.12, environment: 0.26 }`; key `0xffe9c9 @ 2.6` and ambient `0xf4f1ea
@ 0.08` untouched, per the task rule that ambient never moves. Measured on a 390×844
high-tier still with the overlays hidden, interior pixels only (the cutaway leaves a dark
margin that pollutes whole-frame numbers):

| still | interior mean | p05 | p50 | p95 | clipped >250 |
|---|---|---|---|---|---|
| before (`1.00 / 0.14`) | 102.0 | 12 | 116 | 199 | 0.00 % |
| after (`1.12 / 0.26`) | 113.4 | 12 | 127 | 215 | 0.00 % |
| ref-B concept frame | 121.0 | 50 | 119 | 216 | 0.04 % |

Highlight control now matches the concept frame (p95 215 against 216, nothing clipped).
Two gaps remain and neither is grade work:

- **Shadows are two stops deep.** p05 12 against 50. Exposure and environment cannot
  lift them further without blowing highlights, and the rig is one directional plus two
  points at ambient 0.08. The fix is bounce light — a baked AO pass, which the spec's P4
  line calls for and this plan's six tasks never listed.
- **The frame is not warm.** R−B 39 against ref-B's 63. Warming the key to `0xffdfb4` and
  desaturating the sky moved it 0.6, because the cast is the sage wall and the cool tile,
  not the light. Palette, not grading — a P5 item.

The probe itself was lying about the A/B: its text match hid the top bar and left the
INVEST button, the hint line and the mode switcher in frame. `scripts/p4-practicals.mjs`
now hides `#pharm-hud` and `#sim-mode-switcher` by id and warns if either survives.
The pair is `docs/art/p4-390-frame-before.png` / `-after.png`, plate
`docs/art/p4-grade-ab.png` (ref-B left, before middle, after right).

### Task 5 — phone composition

`scripts/p4-composition.mjs` is the new gate: at each width it hides the overlays,
projects the cue's box, screenshots, decodes that PNG back inside the page and averages
pixels inside the cue against a ring 5–30 px around it. It fails on a delta under +40, on
a cue clipped by the frame edge, or on any console/page error.

| width | cue rect (px) | cue | surround | delta |
|---|---|---|---|---|
| 320 | 221, 277, 57×88 | 155.8 | 63.1 | **+92.7** |
| 360 | 241, 277, 57×88 | 154.9 | 63.6 | **+91.4** |
| 390 | 256, 277, 57×88 | 154.6 | 63.9 | **+90.7** |
| 414 | 268, 277, 57×88 | 156.0 | 63.9 | **+92.1** |

`COMPOSITION_PASS`, 0 errors, cue inside the frame at every width. Stills
`docs/art/p4-comp-<width>.png`, numbers `docs/art/p4-composition.json`.

The plan's candidate was the **counter fascia** and it did not survive measurement. A
2.4 × 0.30 m enamel plate with a green cross and "PHARMACY / DISPENSING" was built on the
counter's aisle face and measured **+5.9 at 390 and +1.3 at 414** (and an unreliable +71.8
at 320, which is a surround artefact, not a cue): the spawn camera looks along that face
almost edge-on, so the plate projected 83×78 px of near-foreshortened ivory against an
already-bright white slab. It was reverted rather than shipped on the strength of one
lucky width.

The cue that does read is the **green-cross plate on the back wall** (`pharm-cross-plate`),
which holds ~+91 at every width because the camera faces it. `scripts/cue-probe.mjs` ranks
every signage mesh this way (it is the tool that produced this table); re-run it if the
camera or the room changes before trusting `p4-composition.mjs`.

`contained: false` is unchanged and is not treated as a defect in its own right: at 320 px
the room cannot be both fully framed and keep Chris at a readable 46 px. The acceptance
this task was given is the cue, and the cue passes with 2.3× headroom.

## The three boxes

| Sandbox | Template | What it proves |
|---|---|---|
| `hermes` | `agent-browser` (4 vCPU / 8 GB) | clean Linux build, unit suite, headless Chromium layout gate, perf probe |
| `hermesandroid` | `android` (Android 14 emulator) | real Android WebView, touch viewport, touch copy, GPU emulation path |
| `hermesandroid2` | `android` | the same on a second emulator, so the run reproduces on different silicon |

All three build the same bundle. Compare the hashed asset name between boxes before
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

### Screenshots on Android must come from the framebuffer

`Page.captureScreenshot` over CDP returns the DOM layer only on Android WebView — the
WebGL canvas comes back black even while the game is rendering. The first Android
"evidence" of this build looked like a render failure for exactly that reason; the
device framebuffer (`adb exec-out screencap -p`) showed the shop correctly.
`check-android.mjs` now writes the framebuffer capture and only falls back to CDP if
`adb` is unavailable.

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

## Result of record — 2026-11-26, P4 task 3 practicals (`index-B6UNhwHr.js`, 306 tests)

Tip `052c74d`, pushed, three boxes green on the exact artifact. Still a checkpoint: tasks
4 (grading A/B) and 5 (phone composition) are open, so this is not P4 final.

Two emissive surfaces, both accents of the six families rather than a seventh material:
a warm pendant diffuser at 0.9 and the cold-chain back panel at 0.55, each one cached
material so every lamp in the room merges into a single draw. `LIGHTS.*.crossGlow` is
`fridgeGlow` now, and the point light is named `pharm-fridge-light` and placed on the
cold-chain bay's own origin instead of a hand-typed coordinate.

**Four defects the numbers alone would not have found.** The first implementation hit
every value the plan asked for and changed nothing visible: the rendered 390 px frame
showed an unlit lamp and a fridge with no light in it. Rendering, cropping at 6×, and
raycasting from the camera found why.

1. **Both right-hand bays were built backwards.** `facing` was inferred from the bay's x
   sign, so antibiotics and the cold-chain unit had the solid back panel and the label
   plate facing the aisle while the glass door, the glow panel and the stock faced the
   wall. The camera was looking at the open back of the fridge. Every bay opens toward
   +z; the sign test is gone.
2. **The glow plane sat 5 mm inside the 7 cm back panel** — the teal was drawn inside the
   cabinet. It is now 2 cm clear of the panel's inner face.
3. **The diffuser was coplanar with the shade's bottom cap and narrower than its mouth**
   (0.22 m disc under a 0.27 m shade), so the depth test handed the pixels to the steel.
   It sits 4 cm below the rim at 0.32 m and the material is double-sided: the game camera
   is above the room and can never see a shade's underside.
4. **An emissive with a cream albedo tone-maps to flat white.** Under the 2.6-intensity
   sun the 0.9 disc rendered as `248,244,233` — brighter than the wall and no warmer.
   Both practicals now have near-black albedo and emit only; the disc reads `245,193,108`.

| Box | Index asset | Tests | Layout gate | Draw calls | Triangles | Textures | Errors |
|---|---|---|---|---|---|---|---|
| `hermes` | `index-B6UNhwHr.js` | 306/306 | pass (7 viewports) | **93** max phone (92.5 avg), 200 max desktop | 13,178 phone | 6.41 MB | 0 |
| `hermesandroid` | `index-B6UNhwHr.js` | — | pass (360×495) | 78 | 12,430 | 6.41 MB | 0 |
| `hermesandroid2` | `index-B6UNhwHr.js` | — | pass (360×495) | 82 max | 12,602 | 6.41 MB | 0 |

Desktop loop on `hermes` served 0 → 5 for +₦2,310 and restored from a 1,062 B save; heap
16.85 → 15.22 MB. Phone heap 23.18 → 23.36 MB. No console or page errors on any box.

**Near-misses, stated rather than rounded:**

- The fridge is now the right way round, and that costs draws: live 1280×800 local probe
  went 134 → 144 draws and 24,350 → 25,534 tris, gate phone 92 → 93, desktop 197 → 200.
  The geometry did not grow; the door, the stock and the panel behind them stopped being
  culled because they are finally on the aisle side. Phone headroom to the 120 budget is 27.
- **The lamp reads as a small amber ring at 390 px, not as a lit lamp.** The disc is 0.32 m
  wide at 2.31 m, roughly ten pixels on a phone — measurably warm (245,193,108) and legible
  at 6×, not a light source the eye finds in one second. Making the lamp read at phone scale
  is a grading and composition question (tasks 4 and 5), not another emissive value.
- **The teal panel reads as a dark teal cabinet interior, not a lightbox.** 0.55 with no
  albedo is the plan's number and it was kept; whether it should rise is task 4's call,
  against the reference stills rather than in isolation.
- The room is still cropped at every phone width (`contained: false`). Unchanged, still task 5.
- `hermesandroid2` reported p50 266.7 ms / p95 800.1 ms against 66.7 / 66.7 on
  `hermesandroid`. Both are SwiftShader on the same artifact; the spread is the host CPU.
  Directional only, never to be quoted as device performance.
- `window.pharmChris` gained a `raycaster()` factory so a probe can cast into the live scene
  without bundling a second copy of three. `Raycaster` alone is imported; the namespace is
  not exposed, which would defeat tree-shaking.

Reproduce:

```bash
node scripts/p4-practicals.mjs --viewport 1280x800 --tag desktop   # stills + screen points
node scripts/p4-practicals.mjs --viewport 390x844 --tag phone
bash scripts/instabox-gate.sh hermes
bash scripts/instabox-gate.sh hermesandroid scripts/android-run.sh
bash scripts/instabox-gate.sh hermesandroid2 scripts/android-run.sh
```

## Result of record — 2026-11-26, P4 roughness maps and atlas (`index-D2dUlHdy.js`, 303 tests)

Tip `6785ede` — three commits on `main` and pushed: `b5e833b` (bay-label atlas + 256²
wall map), `bde4854` (probe texture counting), `6785ede` (per-family roughness maps).
Not a phase close: P4 tasks 3–5 are still open, so this records a gated checkpoint, not
a P4 final.

**The measurement changed, so the old numbers are not comparable.** `instabox-check.mjs`,
`p4-probe.mjs` and `perf-probe.mjs` summed every material slot pointing at a texture, so
one shared family map on forty meshes was billed forty times and the poster atlas was
billed once per shelf bay. De-duplicated by texture uuid, the current boot is **6.41 MB
across 15 unique textures**. The 35 → 15.16 MB figure of 2026-11-24 and the 15.16 →
10.16 MB claimed in `b5e833b` were both inflated by the same bug and should not be
quoted again. Raw material-slot binds are unchanged by this commit; only the meter is.

Task 1 lands plaster mottle (0.72–0.92), wood grain along u (0.42–0.62) and steel brush
along v (0.32–0.50) as three seeded 256² fields, wired through `FamilySpec.roughnessMap`
with the scalar pinned to 1 so three multiplies rather than clamps. The maps cost
+0.75 MB of unique texture and **zero draws**: no new material family, no new mesh.
Tile, glass and brass were left alone deliberately — a noise map on the specular
families reads as dirt.

| Box | Index asset | Tests | Layout gate | Draw calls | Triangles | Textures | Errors |
|---|---|---|---|---|---|---|---|
| `hermes` | `index-D2dUlHdy.js` | 303/303 | pass (7 viewports) | **92** max phone (91.5 avg), 197 max desktop | 13,170 phone | 6.41 MB | 0 |
| `hermesandroid` | `index-D2dUlHdy.js` | — | pass (360×495) | 78 | 12,462 | 6.41 MB | 0 |
| `hermesandroid2` | `index-D2dUlHdy.js` | — | pass (360×495) | 78 | 12,462 | 6.41 MB | 0 |

`hermes2` is deliberately absent: it is a Creator Studio slot, not a general sandbox,
and is no longer part of this gate. The gate is three boxes from here on.

Desktop loop on `hermes` served 0 → 5 customers for +₦3,010, and restored cash/day/served
from a 1,062 B save. Heap was flat or falling across both passes (desktop 16.74 → 14.72 MB,
phone 19.92 → 19.97 MB over ten samples) — not a leak test, just no growth in a 77 s run.

**Near-misses, stated rather than rounded:**

- Phone draws rose 90 → 92. The atlas held the count flat; the roughness maps added two.
  Headroom to the 120 budget is 28 draws, but the live high-tier path measures 134 at
  360×800 — the gate's phone pass is the forced low tier and is not that number.
- **The room is still cropped on every phone width** (`contained: false` at 320/360/390/414).
  HUD has no overlaps and no horizontal overflow, but this is P4 task 5, still open.
- Android frame times are SwiftShader: p50 66.7 ms on `hermesandroid`, 200.1 ms on
  `hermesandroid2` with p95 666.7 ms. Directional only, never to be quoted as device
  performance; the spread between the two emulators is the host's CPU, not the build.
- Zero console or page errors on all three boxes and on the deployed site
  (`https://pharm-chris.vercel.app/`, `index-D2dUlHdy.js`, 134 draws, 24,350 tris at
  360×800 high tier after Vercel picked up the push at 14:36).

Reproduce:

```bash
bash scripts/instabox-gate.sh hermes
bash scripts/instabox-gate.sh hermesandroid scripts/android-run.sh
bash scripts/instabox-gate.sh hermesandroid2 scripts/android-run.sh
```

## Result of record — 2026-11-24, P4 first pass (`index-h2ROQeTs.js`, 295 tests)

Two defects fixed, both found by rendering the phone frame rather than by reading code.

1. **The pharmacy sign was not an identity cue.** It hung at 2.25 m, putting the top of a
   1.3 m cross at 2.90 m — 10 cm above the 2.8 m wall — and it was dull green (0x2e7d32)
   on a dark green wall. At 360 px that is a 54×82 px green-on-green patch; a first-time
   viewer read the room as a convenience store. It is now a cream plate (1.44 m, centred
   2.02 m, entirely on the wall) with a brighter cross 4 cm proud of it, both backlit.
   Measured on the boot frame: mean luminance **130 inside the sign vs 61 surrounding
   (+68)** at 360/390/414 px, and 132 vs 88 (+44) at 320 px.
2. **Material families had drifted from spec §6.3.** glass `0.16 / 0.28 / 0.7` →
   `0.06 / 0.16 / 1.6`, steel metalness `0.55` → `0.15`. `tests/arcade/materials_spec.test.ts`
   now carries a hand-copied literal of the spec table, so drift is a red test rather than
   a review opinion. Brass entered as `brassAccent()` — an accent of steel, not a seventh family.

Marker: **295 tests** (was 282), bundle `index-h2ROQeTs.js` on all four boxes.

| Box | Index asset | Tests | Layout gate | Draw calls | Triangles | Textures | Errors |
|---|---|---|---|---|---|---|---|
| `hermes` | `index-h2ROQeTs.js` | 295/295 | pass (7 viewports) | **94** max phone (93.5 avg), 206 desktop | 13,168 phone | 15.16 MB | 0 |
| `hermes2` | `index-h2ROQeTs.js` | 295/295 | pass (7 viewports) | **94** max phone (93.5 avg), 204 desktop | 13,168 phone | 15.16 MB | 0 |
| `hermesandroid` | `index-h2ROQeTs.js` | — | pass (360×495) | 80 | 12,460 | 15.16 MB | 0 |
| `hermesandroid2` | `index-h2ROQeTs.js` | — | pass (360×495) | 80 | 12,460 | 15.16 MB | 0 |

Cost of the sign: **+1 phone draw** (93 → 94, the plate) and +44 triangles. Desktop moved
199–203 → 204–206; two of those draws are the sign, the rest is the desktop loop reaching a
different queue depth between runs (its sample range was 139–199 before this change).

Still open in P4: per-family roughness maps (plaster mottle, wood grain, steel brush),
emissive pendant and fridge geometry, a point light still named `crossGlow` that is the
fridge light, sign-atlas consolidation (13 MB of the 15.16 MB is thirteen 512² surfaces),
and the grading A/B against the reference stills. Plan: `docs/superpowers/plans/2026-11-24-p4-material-and-light.md`.

## Result of record — 2026-11-24, P3 characters closed (`index-BnJWOAvF.js`, 282 tests)

P3 (characters) had been code-complete since 2026-11-22 without a four-box record: the
beard/hair pass (`c9fd7b8`) and its follow-up fix (`6270bea`) landed after the last gate,
which ran at `ff25b0b` with 241 tests. This record closes that gap. Nothing was changed to
make it pass.

Marker that the boxes ran this artifact: **282 tests** (was 241) and **textures 15.16 MB**
(was 17.04) on all four boxes, same bundle `index-BnJWOAvF.js` everywhere.

| Box | Index asset | Tests | Layout gate | Draw calls | Triangles | Textures | Errors |
|---|---|---|---|---|---|---|---|
| `hermes` | `index-BnJWOAvF.js` | 282/282 | pass (7 viewports) | **93** max phone (92.5 avg), 199 desktop | 13,124 phone | 15.16 MB | 0 |
| `hermes2` | `index-BnJWOAvF.js` | 282/282 | pass (7 viewports) | **93** max phone (92.5 avg), 203 desktop | 13,124 phone | 15.16 MB | 0 |
| `hermesandroid` | `index-BnJWOAvF.js` | — | pass (360×495) | 79 | 12,416 | 15.16 MB | 0 |
| `hermesandroid2` | `index-BnJWOAvF.js` | — | pass (360×495) | 79 | 12,416 | 15.16 MB | 0 |

Desktop loops served 4 and 5 customers and restored cash/day/served from a 1,260 B save on
both PC boxes. Budgets: phone ≤120 (93), desktop ≤240 (203), textures ≤24 MB (15.16).

**Deltas against the 2026-11-21 record, stated rather than smoothed:**

| Measure | 2026-11-21 (`ff25b0b`) | Now (`6270bea`) | Delta |
|---|---|---|---|
| Tests | 241 | 282 | +41 |
| Phone draws (max) | 93 | 93 | 0 |
| Desktop draws | 206 / 206 | 199 / 203 | −3 / −7 |
| Textures | 17.04 MB | 15.16 MB | **−1.88 MB** |
| Phone triangles | 11,020 | 13,124 | +2,104 |
| Android draws / tris | 80 / 10,528 | 79 / 12,416 | −1 / +1,888 |

The texture delta is recorded as measured, not as a saving: no single asset was removed to
produce it in this pass — the crowd renders from the jointed rig in both records, and the
sprite atlas only loads under `?art=sprites` (which measures 19.18 MB, so it is not the
missing 1.88 MB either). The 13 MB of 512² surface maps (floor tile, street, counter,
signage) are unchanged. The triangle increase is the hair, beard and bag geometry added in
`c9fd7b8` — 2,104 triangles for a cast that now differs per customer — inside a 45 k budget.

Known gap carried into P4: phone portrait framing crops the room (`contained: false` at
every width under 768 px, by design — the shop cannot fit a 0.45 aspect at the fill band).
That crop is what left the pharmacy sign a small patch at the edge of the frame.

## Result of record — 2026-11-20, character draw pass (`index-D__Q-wKw.js`, 192 tests)

One change: every character rig merges to one mesh per animated joint on a single
vertex-coloured material (`kit/rigMerge.ts`). Marker: **192 tests** (was 188) and a
phone frame at **91** draw calls.

| Box | Build | Tests | Layout gate | Draw calls | Errors |
|---|---|---|---|---|---|
| `hermes` | clean | 192/192 | pass (7 viewports) | 90.3 avg / 91 max phone, **202 desktop** | 0 |
| `hermes2` | clean | 192/192 | pass (7 viewports) | 90.3 avg / 91 max phone, **200 desktop** | 0 |
| `hermesandroid` | clean | — | pass (360×495) | 78, 10,472 tris | 0 |
| `hermesandroid2` | clean | — | pass (360×495) | 78, 10,472 tris | 0 |

Budgets: phone ≤120 (91), desktop ≤240 (202), textures ≤24 MB (16.75). A forced
six-customer queue on the desktop tier measures **218** draws where it measured 287
before this pass — the worst case now sits inside the ceiling instead of 20 % over it.

What the merge costs: per-part roughness and metalness collapse to one value
(0.62 / 0.02) for the whole character. Skin, cloth, hair and accessories keep their
colours through vertex colours; only the sheen variation is gone.

## Result of record — 2026-11-20, P2 prop kit (`index-D__Q-wKw.js`)

P2 adds the dressing, the labelled stock and the modular expansions. Marker that the
boxes ran this artifact: **188 tests** (was 174), `textureMB: 16.75`, and a phone
frame with **101** draw calls over 95 meshes.

| Box | Build | Tests | Layout gate | Draw calls | Errors |
|---|---|---|---|---|---|
| `hermes` | clean | 188/188 | pass (7 viewports) | 100.3 avg / 101 max phone, 237 desktop | 0 |
| `hermes2` | clean | 188/188 | pass (7 viewports) | 100.3 avg / 101 max phone, 240 desktop | 0 |
| `hermesandroid` | clean | — | pass (360×495) | 88, 10,472 tris | 0 |
| `hermesandroid2` | clean | — | pass (360×495) | 90, 10,560 tris | 0 |

Budgets: phone ≤120 draws (measured 101), desktop ≤240 (237/240), textures ≤24 MB
(16.75). Expansion level 2 on a 390 px phone measures 106 draws and 11 k triangles;
the whole 24-prop dressing is 14 draws / 3.4 k triangles; both expansions together
are ≤10 draws.

Desktop loops served 0 → 5 customers and restored cash/day/served from a 1,062 B
save. Phone p50 66.7–83.4 ms on the PC boxes, 66.7/200 ms on the emulators — SwiftShader
numbers, directional only, not a claim about a real phone GPU.

**Overruns and near-misses, recorded rather than rounded away:**

- Desktop draw calls sit at 237–240 against a 240 ceiling *at the queue sizes the
  boxes happened to reach* (5 served, 2 queued). A forced 6-customer queue measures
  **287**: each customer is ~10 draws after the per-material merge, and the shadow
  pass doubles it. The fix is the spec's own crowd LOD — collapse a customer rig to
  one vertex-coloured draw — and that is P3 character work, not P2.
- `check-mobile.mjs` and `check-android.mjs` now wait for the follow camera to settle
  before measuring a zone. Both previously used a flat 450–500 ms, which measured a
  camera still in flight and produced one-frame-off failures (320 px and the
  `hermesandroid2` 360×495 run).

## Result of record — 2026-11-19, art v3 build (`index--u5iKoNb.js`)

Previous record: 2026-11-18, `index-ChqAL9nf.js`, 76 max phone draw calls, 0 texture MB.

The marker proving the box ran the current artifact: **`textureMB: 28`**, up from 0
before the procedural surface pass.

| Box | Build | Tests | Layout gate | Draw calls | Errors |
|---|---|---|---|---|---|
| `hermes` | clean | 151/151 | pass (7 viewports) | 89 avg / 96 max phone, 154 desktop | 0 |
| `hermes2` | clean | 151/151 | pass (7 viewports) | 89 avg / 96 max phone, 154 desktop | 0 |
| `hermesandroid` | clean | — | pass (360×495) | 79, 1,456 tris | 0 |
| `hermesandroid2` | clean | — | pass (360×495) | 79, 1,456 tris | 0 |

Desktop loop on both PC boxes served real customers (0 → 4 and 0 → 5) and restored
cash/day/served from a 1,260 B save. Android framebuffer screenshot mean luminance
110.8 — the canvas is rendering, not black.

Frame times are SwiftShader: phone p50 50–83 ms on the PC boxes, 66.7 ms on the
emulator. Directional only; they are not evidence about a real phone GPU and must
not be quoted as performance.

Reproduce:

```bash
bash scripts/instabox-gate.sh hermes
bash scripts/instabox-gate.sh hermes2
bash scripts/instabox-gate.sh hermesandroid scripts/android-run.sh
bash scripts/instabox-gate.sh hermesandroid2 scripts/android-run.sh
```

## Known gaps

- **Naira glyph on AOSP.** In the emulator's WebView the HUD shows `N145k`, `N4.2m`,
  `N60k` — the AOSP font stack has no U+20A6, so `₦` falls back to a bare `N`. PC
  boxes render the sign correctly. Fix is a bundled webfont subset carrying U+20A6 in
  the HUD font stack; not yet done, and it needs a check on a real Tecno/Infinix.
- **No iOS/Safari pass.** Safari's `100vh`, touch handling and font stack are untested.
- **No 90-day browser soak.** Season logic is proven by `tests/season_bot.test.ts`, not
  by playing 90 days in a browser; long-session heap growth is unmeasured.
