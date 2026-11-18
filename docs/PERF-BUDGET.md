# Performance budget — 360×800, 2GB Android

The player device is a **Tecno/Infinix-class Android phone**, not a desktop. This
document records what we measured, what missed the budget, what was changed, and
what remains unverified.

## Device profile used

| Setting | Value |
|---|---|
| Viewport | 360 × 800 CSS px, DPR 2 (720 × 1600 device px) |
| CPU | Chrome DevTools **6× throttling** (CDP `Emulation.setCPUThrottlingRate`) |
| Network | 1.6 Mbps down / 750 kbps up, 150 ms latency (Slow 4G) |
| Quality tier | `low` (`?quality=low`, what the detector picks on ≤2GB / ≤4 cores) |
| Harness | `scripts/perf-probe.mjs` (Playwright + CDP), 10 samples over a 25 s scripted session: dock → shelf → counter ×3 |

## Budget vs measured

| Metric | Budget | Before | After (low tier) | After (high tier) | Status |
|---|---|---|---|---|---|
| Draw calls / frame | < 120 | **161 max** (145 avg) | **76 max, 75 avg** | 133 max, 111 avg | ✅ low tier |
| Triangles | (no budget set) | 3,480 | 2,408 | 3,024 | ✅ |
| Texture memory | < 40 MB | ~0 (procedural only) | ~0 | 4 MB (shadow map) | ✅ |
| Frame time p50 @6× | 33 ms (30 fps) | 100 ms | **33 ms (30 fps)** | 67 ms (15 fps) | ⚠️ see gaps |
| Frame time p95 | — | 167 ms | 50 ms | 133 ms | — |
| JS heap after GC | flat | — | 6.1 MB, stable | 6.2 MB, stable | ✅ |
| Per-frame allocations in hot paths | zero | 6 alloc sites | 0 | 0 | ✅ |
| Console/page errors | 0 | 0 | 0 | 0 | ✅ |

`Before` is the same harness, same scene, run earlier in this session against the
pre-optimisation build (staff/expansions absent, 2 customers queued).

### Re-measured after the camera rework (2026-11-18)

The camera now solves its framing from the room's projected corners instead of a
fixed aspect multiplier, which changes what is on screen and therefore the draw
counts. Same probe harness, same device profile, run in an Instabox sandbox:

| Where | Draw calls | Triangles | Frame time | Notes |
|---|---|---|---|---|
| Phone profile, low tier, 6× CPU throttle | **76 max, 75 avg** | 2,408 | p50 33.3 ms / p95 50 ms | the budget case; below the 85 of the previous build |
| Desktop 1280×720, high tier | 143 max | — | not measured | higher than before (134): the camera is further out and frames the whole room, so less is culled |
| Android 14 WebView 360×495 (emulator, SwiftShader) | 70 | 2,056 | p50 66.7 ms | software GL; the ms figure is not a phone number |

Desktop is above the 120 draw-call budget by design at the wider framing. The budget
targets the 2GB Android profile, and that profile improved. If the desktop figure
matters, the lever is a distance-based cull on the far shelf bays, not a smaller room.

## What was cut, and why

1. **Shelf display boxes → `InstancedMesh`** (`PharmacyShelves3D`). Nine meshes per
   bay became one instanced draw; four bays: 36 draws → 4.
2. **Removed per-bay contact-shadow meshes** (4 draws) — the floor plate already
   reads as grounded at this camera distance.
3. **Sneeze-guard glass: `MeshPhysicalMaterial` with `transmission` → plain
   transparency.** This was the largest single cost: a transmission material forces
   three.js to render the *entire scene* into an extra buffer every frame, doubling
   draw calls (136 → 85 just from this change) for a detail invisible from the
   isometric camera.
4. **Character rigs merged per material** (`mergeMeshes.ts`). Each customer/player was
   ~21–29 box primitives; merging inside each animated socket keeps the walk cycle and
   the stack lean, and cuts the mesh count by roughly 5× per character.
5. **Quality tier** (`quality.ts`). On `deviceMemory ≤ 2`, `hardwareConcurrency ≤ 4`
   or `prefers-reduced-motion`, the shadow pass is disabled, antialiasing is off and
   pixel ratio is capped at 1. Shadows on a phone cost a second full pass over every
   caster (23 casters ≈ 23 extra draws) plus fill rate.
6. **Zero per-frame allocation** in the hot paths:
   - `InputController.getDirection()` returns a reused `Vector2` (was 1–2 per frame).
   - `MedicineStack.update()` reuses velocity/acceleration scratch vectors (was 3 + a clone).
   - `CashDropManager.update()` reuses target/direction scratch vectors (was 2–3).
   - `ArcadeViewport.updateCameraFollow()` reuses a scratch `Vector3` (was 1 clone).
   - `ArcadeStaff.update()` reuses a steering scratch vector (was 1 clone).
   - `ArcadeGameDirector.handleShelf()` iterates a module-level array (was
     `Object.entries()` per frame).
7. **Economy decoupled from frame rate.** The tick now uses the real elapsed time for
   the simulation (clamped at 1 s) while physics uses a stable ≤100 ms step. Before
   this, a 6 fps device ran the whole economy at 0.6× speed — the shop literally traded
   in slow motion, and offline earnings no longer matched wall clock.
8. **Textures**: everything is procedural (`MedicineTextures` uses canvas at load);
   the only renderer textures are the shadow map and internal targets.

## Gaps — read this before quoting the numbers

- **This is a throttled desktop GPU, not a phone.** p50 50 ms at 6× throttle means the
  fill/GPU cost dominates after the CPU work was removed (the whole `run.tick` +
  game-loop JS is **0.08 ms/frame**, measured in-page). An actual
  `Tecno Spark / Infinix Hot` capture with `chrome://inspect` is still required before
  claiming "30 fps sustained".
- The 6× CPU throttle does not emulate Android's GPU or thermal throttling. Treat the
  frame-time rows as a relative signal (50 % faster p50 after the changes), not as
  device truth.
- Draw-call **max** on the high tier (133) still exceeds 120 when the queue fills.
  Low tier (the shipped phone path) is 85 max.
- No texture atlas / batching pass yet: the scene is ~70 distinct meshes by design
  (procedural geometry, no art pipeline). A merge of the static environment would take
  another ~12 draws off if that becomes the constraint.

## Re-running

```bash
npm run build
npx vite preview --port 4173            # separate terminal
QUALITY=low  node scripts/perf-probe.mjs   # writes perf-low.json + prints the table
QUALITY=high node scripts/perf-probe.mjs
```

`window.pharmChris.perf()` exposes `{ drawCalls, triangles, textures, geometries, frameMs }`
for ad-hoc checks; `?quality=low|high` forces a tier.
