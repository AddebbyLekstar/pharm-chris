# Pharm Chris — P1 Room Shell and Light Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Pharm Chris's blockout room with an 8.4 × 9.2 m dollhouse shell — thick cutaway walls, beveled trim, warm terrazzo, a three-light rig — framed by a camera that keeps the room at 82–88 % of the screen width and Chris at ≥ 46 px on a 360 px phone.

**Architecture:** One layout module becomes the single source of truth for every coordinate (bounds, bays, zones, queue slots), so shrinking the shop is a data change, not a hunt. Geometry comes from a small kit (`roundedBox`, `chamferBox`) and a six-family material library; the room shell is built by a dedicated builder that ArcadeScene delegates to. Lighting stays one key + two practicals + a PMREM environment, with the existing baked vertex AO retained. Everything ships behind `?art=v4`, which becomes the default.

**Tech Stack:** TypeScript, three.js r187, Vite, Vitest, Playwright gates, Instabox.

**Spec:** `docs/superpowers/specs/2026-11-19-graphics-redesign-design.md`

## Global Constraints

- Starting shop interior: **8.4 m wide × 9.2 m deep**; walls **0.3 m** thick.
- Chris renders **≥ 46 px** tall at every phone viewport listed below; room fills **0.82–0.88** of viewport width.
- Camera: **32° fov** at every aspect (no per-aspect fov ladder).
- Material families: exactly six (plaster 0.86, tile 0.25–0.45, satin wood 0.55, powder steel 0.42, glass 0.16/0.06, paper 0.9).
- Lights: one directional + at most two point lights. Ambient ≤ 0.12. `scene.environment` on the high tier only.
- Every new mesh: no 90° exposed edge (3–5 cm bevel), `castShadow` where it touches light.
- Low-tier budget: ≤ 120 draw calls, ≤ 45 k triangles, ≤ 24 MB textures.
- `?art=v4` is the default; `v1|v2|v3` stay reachable.
- All four Instabox boxes must pass `scripts/instabox-gate.sh` before the phase is called done.
- 151 existing tests stay green.

## Review Focus

1. **A save written against the old 16 × 18 m layout** — the player position is outside the new walkable bounds; it must clamp on load, not teleport the camera into a wall or throw.
2. **Orientation change mid-session** (portrait ↔ landscape resize) — the camera solve must re-run and the room/character rules must still hold, not drift.
3. **320 px wide viewport** — the narrowest phone: the fill band and the 46 px floor must both survive.
4. **Expansion purchased while zoomed in** — bounds change under a live camera; it must step back one notch, never clip through the new wall.
5. **Low quality tier** — shadows disabled and pixel ratio capped; the room must still read (no black walls, no flat white floor).

---

### Task 1: Layout module and coordinate migration

**Files:**
- Create: `src/ui/arcade/layout.ts`
- Modify: `src/ui/arcade/ArcadeScene.ts` (bounds, `getRoomBounds`, `getWalkableBounds`, prop positions)
- Modify: `src/ui/arcade/TriggerZone.ts` (zone configs)
- Modify: `src/ui/arcade/ArcadeViewport.ts` (`DEFAULT_PLAYABLE_BOUNDS`)
- Modify: `src/ui/arcade/FloorUpgradePad.ts` (pad positions)
- Test: `tests/arcade/layout.test.ts` (new), `tests/arcade/zones.test.ts` (import from layout)

**Interfaces:**
- Produces: `SHOP_W = 8.4`, `SHOP_D = 9.2`, `WALL_T = 0.3`, `WALKABLE: {minX:-3.6,maxX:3.6,minZ:-3.9,maxZ:3.9}`, `ROOM: {minX:-4.2,maxX:4.2,minZ:-4.6,maxZ:4.6}`, `DOCK = {x:0,z:-3.4,radius:1.1}`, `SHELF_BAYS: Array<{id:string,category:string,label:string,color:string,x:number,z:number,triggerRadius:number}>`, `COUNTER = {x:0,z:1.6,width:3.2,depth:0.95,radius:1.2}`, `QUEUE_SLOTS: Array<{x:number,z:number}>`, `EXPANSION_BOUNDS: {0:Rooms,1:Rooms,2:Rooms}`.

- [ ] **Step 1: Write the failing layout test**

```ts
import { describe, it, expect } from 'vitest';
import { WALKABLE, ROOM, DOCK, COUNTER, SHELF_BAYS, QUEUE_SLOTS, WALL_T, ZONES } from '../../src/ui/arcade/layout';

describe('shop layout', () => {
  it('keeps every walkable point 0.3m clear of the interior wall face', () => {
    expect(WALKABLE.minX - ROOM.minX).toBeGreaterThanOrEqual(WALL_T + 0.25);
    expect(ROOM.maxX - WALKABLE.maxX).toBeGreaterThanOrEqual(WALL_T + 0.25);
  });
  it('has four shelf bays, each inside the room and not overlapping another zone', () => {
    expect(SHELF_BAYS).toHaveLength(4);
    const all = ZONES.map((z) => ({ id: z.id, x: z.x, z: z.z, r: z.radius }));
    for (let i = 0; i < all.length; i++) {
      expect(all[i].x - all[i].r).toBeGreaterThan(ROOM.minX);
      expect(all[i].x + all[i].r).toBeLessThan(ROOM.maxX);
      for (let j = i + 1; j < all.length; j++) {
        const d = Math.hypot(all[i].x - all[j].x, all[i].z - all[j].z);
        expect(d, `${all[i].id} vs ${all[j].id}`).toBeGreaterThan(all[i].r + all[j].r);
      }
    }
  });
  it('places dock, counter and queue slots inside the walkable floor', () => {
    for (const p of [DOCK, COUNTER, ...QUEUE_SLOTS]) {
      expect(p.x).toBeGreaterThan(WALKABLE.minX);
      expect(p.x).toBeLessThan(WALKABLE.maxX);
      expect(p.z).toBeGreaterThan(WALKABLE.minZ);
      expect(p.z).toBeLessThan(WALKABLE.maxZ);
    }
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/arcade/layout.test.ts`
Expected: FAIL — `Cannot find module '../../src/ui/arcade/layout'`.

- [ ] **Step 3: Create `src/ui/arcade/layout.ts` with the spec's §6.6 numbers**

Export the constants above, plus a derived `ZONES: Array<{id, name, x, z, radius, color}>` covering dock, the four bays and the counter, and `EXPANSION_BOUNDS` giving `WALKABLE`/`ROOM` for levels 0, 1 (+1.6 m east) and 2 (+1.2 m north-west, per the spec).

- [ ] **Step 4: Point every consumer at the module**

Replace the literals in `ArcadeScene` (bounds, wall/counter/shelf positions), `TriggerZone.setupZones` (build configs from `ZONES`), `ArcadeViewport.DEFAULT_PLAYABLE_BOUNDS`, and `FloorUpgradePad`. Update `tests/arcade/zones.test.ts` to import `ZONES` instead of hard-coding coordinates.

- [ ] **Step 5: Add the old-save clamp test (Review Focus 1)**

```ts
// tests/arcade/layout.test.ts — add clampToWalkable to the existing import list
it('clamps a player position saved against the old 16x18m layout', () => {
  expect(clampToWalkable({ x: -6, z: -6.5 })).toEqual({ x: WALKABLE.minX, z: WALKABLE.minZ });
});
```

Implement `clampToWalkable(p: {x:number;z:number})` in `layout.ts` with `Math.min/max`, and call it from `ArcadePlayer` wherever the saved position is applied.

- [ ] **Step 6: Run the suite**

Run: `npx vitest run`
Expected: all previously passing tests that do not assert old coordinates pass; `layout.test.ts` green. Fix any test that still asserts the 16 × 18 m numbers by importing from the module instead.

- [ ] **Step 7: Commit**

```bash
git add src/ui/arcade/layout.ts src/ui/arcade/ArcadeScene.ts src/ui/arcade/TriggerZone.ts src/ui/arcade/ArcadeViewport.ts src/ui/arcade/FloorUpgradePad.ts src/ui/arcade/ArcadePlayer.ts tests/arcade
git commit -m "refactor(arcade): single layout module; shrink shop to 8.4x9.2m"
```

---

### Task 2: Camera solve — fill band and 46 px floor

**Files:**
- Modify: `src/ui/arcade/ArcadeViewport.ts` (`resize`, `fitCameraToBounds`, `playableDistance`, constants)
- Modify: `tests/arcade/viewport_framing.test.ts`
- Modify: `scripts/check-mobile.mjs` (player floor 38 → 46)

**Interfaces:**
- Consumes: `WALKABLE`, `ROOM`, `EXPANSION_BOUNDS` from Task 1.
- Produces: `viewport.roomFill: number` (0–1, share of viewport width the room occupies) and `viewport.playerPixels(x, z): number`, both public, so tests and the Playwright gate read the same numbers the camera used.

- [ ] **Step 1: Replace the fov ladder and write the failing framing tests**

In `resize()`, set `this.camera.fov = 32` unconditionally. In `viewport_framing.test.ts`, add:

```ts
for (const [w, h] of PHONES) {
  it(`fills 82-88% of the width and keeps Chris >= 46px at ${w}x${h}`, () => {
    viewport.resize(w, h);
    settle(viewport, 0, 0.2);
    expect(viewport.roomFill).toBeGreaterThanOrEqual(0.82);
    expect(viewport.roomFill).toBeLessThanOrEqual(0.88);
    expect(viewport.playerPixels(0, 0.2)).toBeGreaterThanOrEqual(46);
  });
}
it('steps back one notch when expansion level 1 is applied', () => {
  viewport.resize(360, 800);
  const before = viewport.camera.position.distanceTo(viewport.cameraTarget);
  viewport.setPlayableBounds(EXPANSION_BOUNDS[1].walkable);
  viewport.resize(360, 800);
  expect(viewport.camera.position.distanceTo(viewport.cameraTarget)).toBeGreaterThan(before);
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run tests/arcade/viewport_framing.test.ts`
Expected: FAIL — `viewport.roomFill is undefined`.

- [ ] **Step 3: Implement the solve**

Compute the distance that makes the room's projected width equal `0.85 × viewportWidth` (binary search over distance with the existing `probeCamera`, reusing `solveContainDistance`'s projection approach), then clamp: never closer than the distance that keeps `playerPixels ≥ 46`. Expose `roomFill` from that projection and a public `playerPixels(x, z)` using the 1.62 m character height (not 1.75). Clamp distance to the `EXPANSION_BOUNDS` room so the camera cannot exit through a wall.

- [ ] **Step 4: Run the framing tests**

Run: `npx vitest run tests/arcade/viewport_framing.test.ts`
Expected: PASS at 320/360/390/414 and on desktop.

- [ ] **Step 5: Update the Playwright gate threshold**

In `scripts/check-mobile.mjs`, change the player floor from 38 to **46** and add an assertion that `roomFill` is within `0.80–0.90` at 360 and 390.

- [ ] **Step 6: Run the gate locally**

Run: `npm run build && npx vite preview --port 4173 --strictPort &` then `node scripts/check-mobile.mjs`
Expected: `"passed": true`, `"failures": []`.

- [ ] **Step 7: Commit**

```bash
git add src/ui/arcade/ArcadeViewport.ts tests/arcade/viewport_framing.test.ts scripts/check-mobile.mjs
git commit -m "feat(camera): 32-degree dollhouse framing, 82-88% fill, 46px character floor"
```

---

### Task 3: Kit geometry helpers

**Files:**
- Create: `src/ui/arcade/kit/geometry.ts`
- Test: `tests/arcade/kit-geometry.test.ts`

**Interfaces:**
- Produces: `roundedBox(w: number, h: number, d: number, radius = 0.04, segments = 2): THREE.BufferGeometry`, `chamferBox(w: number, h: number, d: number, bevel = 0.035): THREE.BufferGeometry`, `panelLines(w: number, h: number, cols: number, rows: number): THREE.BufferGeometry` (a thin inset grid used for cabinet faces).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { roundedBox, chamferBox } from '../../src/ui/arcade/kit/geometry';

describe('kit geometry', () => {
  it('roundedBox keeps the requested outer size', () => {
    const g = new THREE.Box3().setFromBufferAttribute(roundedBox(2, 1, 3, 0.04).attributes.position as THREE.BufferAttribute);
    expect(g.max.x - g.min.x).toBeCloseTo(2, 5);
    expect(g.max.y - g.min.y).toBeCloseTo(1, 5);
    expect(g.max.z - g.min.z).toBeCloseTo(3, 5);
  });
  it('chamferBox has no axis-aligned corner vertex', () => {
    const pos = chamferBox(1, 1, 1, 0.05).attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const onCorner = Math.abs(Math.abs(pos.getX(i)) - 0.5) < 1e-6 && Math.abs(Math.abs(pos.getY(i)) - 0.5) < 1e-6;
      expect(onCorner).toBe(false);
    }
  });
  it('stays cheap enough for props', () => {
    expect(roundedBox(1, 1, 1, 0.04, 2).attributes.position.count).toBeLessThan(2000);
  });
});
```

- [ ] **Step 2: Run it, watch it fail** — `npx vitest run tests/arcade/kit-geometry.test.ts` → module not found.

- [ ] **Step 3: Implement using `RoundedBoxGeometry` from `three/examples/jsm/geometries/RoundedBoxGeometry.js`**, with `chamferBox` delegating to it at a small radius and `panelLines` returning a merged set of inset quads. Cache by `${w}|${h}|${d}|${r}` key.

- [ ] **Step 4: Run and pass** — the three assertions above.

- [ ] **Step 5: Commit** — `git commit -m "feat(kit): rounded and chamfered primitives"`

---

### Task 4: Material library

**Files:**
- Create: `src/ui/arcade/kit/materials.ts`
- Modify: `src/ui/arcade/art.ts` (delegate the families instead of ad-hoc materials)
- Test: `tests/arcade/kit-materials.test.ts`

**Interfaces:**
- Produces: `PALETTE: Record<'deepGreen'|'sage'|'plaster'|'terracotta'|'teak'|'laminate'|'brass'|'teal'|'pharmaGreen'|'alertRed', number>`, `materials(): {plaster, tile, wood, steel, glass, paper}` — each a cached `MeshStandardMaterial` configured per the six-family table.

- [ ] **Step 1: Write the failing test** asserting each family's `roughness`, `metalness`, `opacity` and that two calls return the same object identities (cache).
- [ ] **Step 2: Run → FAIL (module missing).**
- [ ] **Step 3: Implement** the palette and the six materials, reusing the procedural textures from `textures.ts` (terrazzo + roughness map on `tile`, teak on `wood`, painted grain on `plaster`) and guarding on `typeof document === 'undefined'` exactly as `textures()` does.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `git commit -m "feat(kit): six-family material library"`

---

### Task 5: Room shell

**Files:**
- Create: `src/ui/arcade/kit/roomShell.ts`
- Modify: `src/ui/arcade/ArcadeScene.ts` (call the builder; delete the inline wall/floor code)
- Test: `tests/arcade/room-shell.test.ts`

**Interfaces:**
- Consumes: `roundedBox` (Task 3), `materials()` (Task 4), `ROOM`/`WALL_T` (Task 1).
- Produces: `buildRoomShell(): THREE.Group` containing `floor`, `wall-back`, `wall-west`, `wall-east`, `trim-base`, `door-frame`; every wall mesh exposes `userData.thickness = 0.3`.

- [ ] **Step 1: Write the failing test** — the group has exactly five named children; each wall's bounding box thickness on its normal axis is `0.3 ± 0.001`; the door opening in the front is 2.2 m wide; no mesh's bounding box exceeds `ROOM` plus `WALL_T`.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** the shell: three visible walls as chamfered boxes with a `trim-base` band at 0.12 m and a terracotta cut-face strip; the floor as a single plane using the `tile` family with the existing 4 × 4.5 texture repeat rescaled to the new size; a front wall in two pieces leaving a 2.2 m doorway.
- [ ] **Step 4: Wire it into `ArcadeScene`** behind `artVersion() === 'v4'`, leaving v1–v3 untouched.
- [ ] **Step 5: Run the full suite** — `npx vitest run` → all green.
- [ ] **Step 6: Commit** — `git commit -m "feat(room): thick cutaway dollhouse shell"`

---

### Task 6: Light rig v4

**Files:**
- Modify: `src/ui/arcade/art.ts` (`LIGHTS.v4`, `applyArtDirection`, `artVersion` default)
- Modify: `src/ui/arcade/ArcadeScene.ts` (`buildLighting` reads the rig)
- Test: `tests/arcade/lighting.test.ts`

**Interfaces:**
- Produces: `LIGHTS.v4 = { sun: {color: 0xFFF1D8, intensity: 2.2}, ambient: {intensity: 0.10}, pendant: {color: 0xFFE3B0, intensity: 1.2, distance: 8}, fridge: {color: 0x2E8B8B, intensity: 0.7, distance: 4} }`; `artVersion()` returns `'v4'` by default.

- [ ] **Step 1: Write the failing test** — build an `ArcadeScene` with `?art=v4`; count lights: exactly one `DirectionalLight`, exactly two `PointLight`s, ambient intensity ≤ 0.12; assert `applyArtDirection` sets `scene.environment` when a renderer is supplied; assert low tier builds with `sun.castShadow === false` and still produces no `MeshBasicMaterial` walls (Review Focus 5).
- [ ] **Step 2: Run → FAIL** (v4 missing).
- [ ] **Step 3: Implement** the v4 rig; move the pendant over the counter and the fridge practical into the cold-chain bay; delete the counter point light.
- [ ] **Step 4: Run → PASS; then `npm run build`.**
- [ ] **Step 5: Add the resize test (Review Focus 2)** — settle at 360×800, call `resize(800, 360)`, assert `roomFill` and `playerPixels` still satisfy the Task 2 bands.
- [ ] **Step 6: Commit** — `git commit -m "feat(light): three-light rig with warm key and practicals"`

---

### Task 7: HUD palette, verification, and the four-box gate

**Files:**
- Modify: `src/ui/style.css` (colour tokens only — no layout changes)
- Modify: `docs/VERIFICATION.md` (P1 record)
- Test: the existing `scripts/check-mobile.mjs`, `scripts/check-android.mjs`

**Interfaces:**
- Consumes: everything above. Produces: no new exports.

- [ ] **Step 1: Swap HUD tokens** to the palette: cream cards `#EFE6D6`, ink `#2A2320`, deep green `#1F4B3F`, brass `#B08A4A`, alert red `#C0453B`; remove the neon glow filters. Touch nothing else in the file.
- [ ] **Step 2: Local gates** — `npm run build`, `node scripts/check-mobile.mjs` → `"passed": true`.
- [ ] **Step 3: Capture the A/B** — screenshot the same camera at 360×800 and 1280×720 for `?art=v3` and `?art=v4`; confirm with the vision check that the room, not the HUD, is what changed.
- [ ] **Step 4: Four-box gate**

```bash
bash scripts/instabox-gate.sh hermes
bash scripts/instabox-gate.sh hermes2
bash scripts/instabox-gate.sh hermesandroid scripts/android-run.sh
bash scripts/instabox-gate.sh hermesandroid2 scripts/android-run.sh
```

Expected on every box: build clean, 151+ tests, 0 failures, draw calls ≤ 120 phone, texture MB ≤ 24.

- [ ] **Step 5: Record and commit** — write the numbers into `docs/VERIFICATION.md` and `git commit -m "feat(art): P1 room shell, light rig, camera — verified on four boxes"`.
- [ ] **Step 6: Report** — before/after images, the four box numbers, and what still reads cheap. Do not deploy; deployment is the founder's call.

---

## Self-review

- **Spec coverage:** §6.1 palette (Task 4), §6.2 proportion (Tasks 2, 5), §6.3 materials (Task 4), §6.4 lighting (Task 6), §6.5 camera (Task 2), §6.6 floor plan (Task 1), §6.7 density (P2 — out of scope here), §7.1 pipeline (Blender begins in P3; P1 is kit-only by design), §7.4 HUD colour (Task 7), §8 budget (Tasks 2, 7), §9 P1 acceptance (Tasks 2, 5, 7), §10 story hooks (P5). P2–P5 get their own plans.
- **Type consistency:** `roomFill` and `playerPixels` are introduced in Task 2 and consumed in Tasks 6 and 7; `ZONES`, `WALKABLE`, `ROOM`, `EXPANSION_BOUNDS` are introduced in Task 1 and consumed in Tasks 2, 5, 6.
- **Review Focus tests:** RF1 → Task 1 Step 5; RF2 → Task 6 Step 5; RF3 → Task 2 Step 1 (320 included in `PHONES`); RF4 → Task 2 Step 1 (expansion step-back); RF5 → Task 6 Step 1.
