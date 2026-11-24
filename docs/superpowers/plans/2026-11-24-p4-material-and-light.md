# Pharm Chris — P4 Material and Light Polish (plan)

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`
> or `superpowers:executing-plans`. Track steps with `- [ ]`.

**Goal:** finish P4 of `docs/superpowers/specs/2026-11-19-graphics-redesign-design.md` §9 —
surface variation across the six families, emissive practicals that match their lights, the
13 MB of duplicated 512² surface textures consolidated, and a grading A/B against the
reference stills — all inside phone ≤120 draws / 45 k tris / 24 MB and desktop ≤240 / 120 k.

**State at the start of this plan:** first pass landed at `33b66dc` (295 tests, four-box gate
green, `docs/VERIFICATION.md` 2026-11-24). The sign and the material spec numbers are done.
What follows is what is left, in the order it should be done.

## Already landed (do not redo)

- Cross on a cream backlit plate, on the wall, measured contrast +68 luminance at 360 px.
- `FAMILY_SPECS` back on spec §6.3, pinned by `tests/arcade/materials_spec.test.ts`.
- `brassAccent()` — brass as an accent of `steel`, family count still six.

## Task 1 — Roughness variation without new memory

**Files:** `src/ui/arcade/textures.ts`, `src/ui/arcade/kit/materials.ts`,
`tests/arcade/materials_spec.test.ts`.

- Three 256×256 greyscale maps from the existing seeded `sheet()`/`rand()` helpers:
  `plasterRoughness` (blotchy, 0.72–0.92), `woodRoughness` (grain along u, 0.42–0.62),
  `steelRoughness` (brush along v, 0.32–0.50).
- `FamilySpec.roughnessMap?: boolean`; `make()` wires it, sets base `roughness = 1` so the map
  carries the value (same pattern as terrazzo in `ArcadeScene.paintFloor`).
- **These three maps cost 0.79 MB — spend the saving from Task 2 first, or do Task 2 in the
  same commit**, otherwise textures go 15.16 → 15.95 MB for no measured benefit.
- Tests: each map exists, is `RepeatWrapping`, and its mean luminance lands inside its band.

## Task 2 — Consolidate the duplicated 512² surfaces

**Files:** `src/ui/arcade/textures.ts`, call sites in `ArcadeScene.ts` / `kit/props.ts`.

Measured on the current build: **13 separate 512² RGBA textures = 13 MB of the 15.16 MB
total.** They are per-call canvas textures (signage and surface families created per prop
rather than per family). Two moves, in this order:

1. **Signage atlas.** `signage()` currently returns a 512² canvas per sign. Follow the
   `POSTER_ATLAS` pattern already in the file: one 1024×1024 atlas, cells addressed by UV.
   Expected saving: 8 signs × 1 MB → 4 MB = **−4 MB**.
2. **Surface dedupe.** Assert in a test that no two materials share an identical texture
   *size + content hash*; whatever the test finds, wire to the shared instance.

Acceptance: `textureMB` ≤ 11.0 on all four boxes, zero visual change in the A/B stills.

## Task 3 — Emissive practicals that match their lights

**Files:** `src/ui/arcade/ArcadeScene.ts`, `src/ui/arcade/art.ts`,
`tests/arcade/light_rig.test.ts`.

- Pendant: emissive warm disc under the shade at `COUNTER` (0.9).
- Fridge: emissive teal panel inside the cold-chain bay (0.55).
- Rename `LIGHTS.*.crossGlow` → `fridgeGlow` and pin it to that bay's geometry. It is the
  fridge light; the cross has no light of its own, and the name has already misled one pass.
- Test: the point light sits within 0.6 m of the cold-chain bay origin; pendant emissive > 0.5.

## Task 4 — Grade against the reference stills

**Files:** `docs/art/p4-*`, `src/ui/arcade/art.ts`.

- A/B `docs/art/references/*` against a 390 px high-tier still with the HUD hidden.
- Adjust exposure, key intensity and `envMapIntensity` only. Never ambient (§6.4).
- Keep the pair in `docs/art/` so the change is reviewable next session, not just described.

## Task 5 — Close the phone composition gap

Not in the original phase list, but it is the finding the first pass produced: at every phone
width the room is cropped (`contained: false`), so anything the composition puts near the
back-wall edge is at risk of sitting half out of frame or behind a shelf bay.

- Keep the sign where it is; instead make sure the frame's *first* second contains a
  pharmacy cue the player is standing in front of — the counter fascia is the candidate.
- Acceptance: HUD-hidden stills at 320/360/390/414 plus a luminance check like the one this
  pass used (+40 or better against its immediate surround).

## Task 6 — Gate and record

- Four boxes on the exact tip; `scripts/instabox-gate.sh <box>` and
  `scripts/instabox-gate.sh <box> scripts/android-run.sh`.
- New "Result of record — P4 final" section in `docs/VERIFICATION.md` with bundle hash, test
  count, draws, triangles, textures, and near-misses stated rather than rounded.
- Delete the `.prev-*` evidence copies that accumulate under `instabox-check/`.

## Constraints that must not move

- Six families only; brass stays an accent of steel.
- One directional + at most two point lights; ambient ≤ 0.12; no ambient wash.
- No new texture larger than 512²; no webfont.
- `?art=v1|v2|v3` stay reachable; v4 stays default.
- Every task ends with a commit; no phase lands before the four-box gate is green.
