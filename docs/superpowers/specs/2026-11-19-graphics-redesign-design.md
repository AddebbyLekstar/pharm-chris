# Pharm Chris — Graphics Redesign (design)

**Date:** 2026-11-19
**Status:** proposed — awaiting founder approval
**Reference:** The Sims Mobile (dollhouse cutaway, warm light, chunky characters, lived-in rooms)
**Scope:** the entire rendered look of the 3D arcade mode. Not the sim economy, not HUD logic.

---

## 1. Intent and why

The game currently reads as a blockout with a production HUD pasted on top. Two art
passes (v2 lighting, v3 procedural surfaces) raised the floor, but the ceiling is
structural: every prop is an unbeveled primitive, the character is a 40 px pawn with a
cube head, and the room is lit like a viewport rather than a place.

The founder's target is The Sims Mobile: a warm, dense, characterful dollhouse where
both the **person** and the **room** are worth looking at, and where a still frame
already implies a story. Nothing in the current build can carry that. This is a
rebuild of the visual layer, not another pass over it.

Success is not "prettier". Success is: a stranger looking at one screenshot with the
HUD cropped out can tell this is a pharmacy in Lagos, can see who works there, and
would believe it shipped.

## 2. Goals

1. A still frame with the HUD hidden reads as a finished, authored scene.
2. Chris is a designed character — proportioned, dressed, rigged, animated — legible
   at 360 px wide.
3. The room is dense and specific: Nigerian community pharmacy, not a generic store.
4. Light does the work: warm key through the door, practical lamps, cool fridge bounce,
   baked occlusion. No flat ambient wash.
5. The build stays inside the mobile budget: ≤ 120 draw calls, ≤ 45k triangles,
   ≤ 24 MB textures on the low tier.
6. The art leaves room for story: faces, close-ups, and staging beats must be possible
   without another rebuild.

## 3. Non-goals

- Photorealism. This is a stylised, toy-adjacent look with disciplined edges.
- A post-processing chain (SSAO, bloom, DOF). Every look must come from geometry,
  materials and light, so the mobile budget survives.
- New gameplay, economy or progression. The sim is untouched.
- The first-person mode's art. It inherits the asset kit later; it is not reworked here.
- Audio.

### 3.1 Locked reference frames

Three concept frames of this shop were rendered and approved. They live in
`docs/art/references/`:

- `ref-A-dollhouse.webp` — target **prop density** and toy-like material read.
- `ref-B-warm-human.webp` — target **staging, warmth and story presence** (people in
  frame, street behind the door). This is the primary reference.
- `ref-C-boutique.webp` — target **edge discipline** and palette restraint.

Where they disagree, B wins on staging and light, A on density, C on silhouette
discipline.

## 4. Anti-goals — what would make this a failure even if it "works"

- A scene that only looks good on desktop at 1280 px.
- Draw calls or texture memory creeping past budget to buy detail.
- Props that are decorative but still obviously boxes (a "plant" that is a cylinder).
- A character with more polygons than personality.
- A warm palette applied as a filter over unchanged geometry.
- Detail that disappears at the real camera distance. Anything under ~4 px on the phone
  is not detail, it is noise and cost.

## 5. Constraints

- **Stack:** TypeScript, three.js r187, Vite. No engine change.
- **Device floor:** 2 GB Android (Tecno/Infinix class), 360×800 CSS px, DPR 2.
- **Verification:** all four Instabox boxes (`hermes`, `hermes2`, `hermesandroid`,
  `hermesandroid2`) via `scripts/instabox-gate.sh`. 151 tests must stay green.
- **Authoring:** Blender 5.2 is available on the host and scriptable headless
  (`blender -b -P`). Authored assets ship as GLB; no Draco (decoder cost on 2 GB devices).
- **No new runtime dependency** beyond three's examples modules already in use.

## 6. Art direction (locked)

### 6.1 Palette

| Role | Hex | Use |
|---|---|---|
| Deep green | `#1F4B3F` | accent wall, fridge casing, brand |
| Sage | `#9BB39A` | main wall paint |
| Plaster cream | `#EFE6D6` | ceiling, trim, upper wall |
| Terracotta | `#C2683F` | floor border, seating, brick trim on cut walls |
| Teak | `#6B4A32` | counter body, shelving frames |
| Laminate | `#F7F3EA` | counter top, shelf tiers |
| Brass | `#B08A4A` | handles, trim, register detail |
| Cold-chain teal | `#2E8B8B` | fridge interior glow, cold products |
| Pharma green | `#2FA36B` | cross, "in stock" states |
| Alert red | `#C0453B` | debt, out of stock |

Floor stays terrazzo but shifts warm (`#E8DCC8` base, chips in sage/terracotta/cream),
so the room is not a white box under warm light.

### 6.2 Proportion

- Character height 1.62 m; **head is 1/4.6 of body height**; shoulders 0.42 m; hands are
  rounded mitts, no fingers modelled.
- Character must render **≥ 46 px tall at 360 px wide** (current floor is 38 px).
- Door 2.1 m, counter 1.05 m, shelf bay 1.9 m × 2.6 m, register 0.55 m wide.
- Everything gets a **3–5 cm bevel** on exposed edges. No 90° edge survives.

### 6.3 Material families

Six only. Every new surface belongs to one of them, so the shader work stays small:

1. **Painted plaster** — roughness 0.86, subtle mottle, vertex AO.
2. **Glazed tile / terrazzo** — roughness map 0.25–0.45, envMapIntensity 0.8.
3. **Satin wood** — roughness 0.55, grain map, slight sheen.
4. **Powder-coated steel** — roughness 0.42, metalness 0.15.
5. **Glass** — opacity 0.16, roughness 0.06, envMapIntensity 1.6, depthWrite false.
6. **Printed paper / labels** — roughness 0.9, texture atlas.

### 6.4 Lighting

- One directional key (warm `#FFF1D8`, intensity 2.2) from the street side, shadows on
  the high tier, contact decals on the low tier.
- PMREM environment at 0.18 for fill. No ambient wash.
- Two practicals only: pendant lamp over the counter (warm, distance 8) and the fridge
  interior (teal, distance 4). Emissive geometry carries the glow; the point lights are
  small and cheap.
- Baked vertex AO on every static mesh, plus 2 cm contact shadows under heavy furniture.
- Exposure 1.0, ACES. If the frame needs more light, fix the key first, never the ambient.

### 6.5 Camera and composition

- Perspective 32° fov, elevation 38°, azimuth 45° — slightly lower than today so walls
  have a visible face rather than reading as a plan view.
- Walls are **thick cutaways** (0.3 m) with a visible plaster cross-section and a
  terracotta trim band, the Sims dollhouse cue.
- Room fills 82–88% of the narrow axis; the solve keeps the ≥ 46 px character rule.
- Ceiling omitted, but pendant lamps hang from an implied ceiling plane and cast a
  visible pool of light on the counter.

### 6.6 Density

Target 28–36 visible dressing objects in the starting shop: shelf fill, plant, water
dispenser, dustbin, stool, fan, posters, price cards, ceiling lamps, crates at the dock,
mat, security grille, generator outside the door. Decoration is authored, not simulated;
it must not touch the walkable bounds or the trigger zones.

## 7. How it gets built

### 7.1 Pipeline

Two tracks, one material library:

- **Authored (Blender → GLB):** the things whose silhouette carries the look —
  Chris, one customer rig, the counter, one shelf bay, the cold-chain fridge, the
  ceiling fan. Built by headless Blender scripts committed under `tools/blender/`, so
  the assets are reproducible, not orphan files.
- **Procedural (three.js kit):** the room shell, dressing props, stock boxes, signage,
  floor, walls. Built from a small kit (`src/ui/arcade/kit/`) with a rounded-box
  helper, a bevel helper, and the six material families. Procedural here means
  scriptable and cheap, not untextured.

Both tracks write into the same material library and the same atlas conventions.

### 7.2 Assets

| Asset | Track | Budget |
|---|---|---|
| `chris.glb` — body, apron, hair, 10-bone rig, 5 clips | Blender | ≤ 4,200 tris, 512 atlas |
| `customer.glb` — one rig, 3 outfit variants, 4 accessories (gele, cap, helmet, hijab) | Blender | ≤ 3,600 tris |
| `counter.glb` — body, kick panel, top, glass guard, register | Blender | ≤ 3,000 tris |
| `shelf_bay.glb` — posts, 4 tiers, brand plate, back panel | Blender | ≤ 2,400 tris |
| `fridge.glb` — casing, glass door, interior shelves, teal glow | Blender | ≤ 2,200 tris |
| Room shell — floor, walls, trim, door, window grille | Kit | ≤ 3,000 tris |
| Dressing props ×24 | Kit | ≤ 250 tris each |
| Stock boxes — instanced, 12-label atlas | Kit | 1 draw call per bay |

Clips for Chris: `idle`, `walk`, `carry_idle`, `carry_walk`, `serve`. Customers:
`walk`, `wait`, `pay`. Staff reuse the customer rig.

### 7.3 Lighting and bake

Vertex AO is baked at load (as today) for static kit geometry, and pre-baked in Blender
for GLB assets (written into a second UV-less colour attribute at export). Contact
decals for heavy furniture. No runtime lightmap, no extra textures.

### 7.4 HUD

The HUD gets restyled to match: cream cards, brass and deep-green accents, 14 px
rounded corners, no neon glow. Layout logic, hit targets and the existing gates are
unchanged — this is a skin, not a rework. The Naira webfont subset ships here, fixing
the known AOSP gap.

## 8. Performance budget

| Metric | Low tier (phone) | High tier (desktop) |
|---|---|---|
| Draw calls | ≤ 120 | ≤ 240 |
| Triangles | ≤ 45,000 | ≤ 120,000 |
| Texture memory | ≤ 24 MB | ≤ 48 MB |
| Frame p50 (box probe, 6× throttle) | no worse than today's 83 ms | — |

Every phase must be measured on all four boxes. A phase that breaks the budget does not
land, regardless of how it looks.

## 9. Phases and acceptance

Each phase ends with a screenshot A/B, the four-box gate, and a commit. No phase starts
before the previous one is verified.

**P1 — Room shell and light.** Thick cutaway walls, warm terrazzo, beveled trim, door and
grille, new camera solve, three-light rig, HUD palette swap. Acceptance: still frame with
HUD hidden reads as a place; player ≥ 46 px at 360 px; budget green.

**P2 — Prop kit and stock.** Counter, shelf bays, fridge, 24 dressing props, instanced
stock with label atlas, signage. Acceptance: the room is dense at 360 px without any prop
becoming noise; draw calls still ≤ 120.

**P3 — Characters.** Chris rig and clips, customer rig, outfits, accessory attaches,
idle/walk/carry animation, staff variants. Acceptance: Chris reads as a person at 46 px,
walk cycle has weight, carry pose is unmistakable.

**P4 — Material and light polish.** Roughness spread per family, glass, brass, emissive
practicals, baked AO pass, colour grading against the concept frames.

**P5 — HUD restyle, Story interface, final verification.** HUD skin + Naira font; the
close-up/portrait hooks below; four-box gate; deploy.

## 10. What this guarantees the story

The narrative pass is a separate project, but this one must not block it. The art
delivers:

- **Faces:** head texture swaps for four emotional states, so a dialogue portrait can be
  rendered from the same mesh (256 px render-to-texture, no separate art).
- **Close-up:** a camera that can push to 22° fov at ~4 m on any character without the
  room breaking apart.
- **Staging:** the cutaway wall and doorway exist so a customer can be framed entering,
  and the counter exists so Chris can be framed serving.
- **Attach points:** hands (carry), head (accessories), counter (props) — story beats can
  add objects without new rigs.

## 11. Left to the builder

- Exact bevel profile and segment counts.
- Atlas packing layout and whether prop textures share one atlas per phase.
- Whether the customer rig is one rig with blendshape-free variants or three meshes.
- The precise camera solve constants (the rule is fixed; the algebra is not).
- Prop list beyond the 24 named, as long as density and budget hold.
- Whether P4 grades in-shader or in Blender during bake.

## 12. Risks

| Risk | Mitigation |
|---|---|
| Blender GLB pipeline breaks on this host | P1 uses the kit only; the pipeline is proven in P3 on the customer rig before Chris is rebuilt on it |
| Character animation reads cheap | Limit to 5 clips, weight over quantity; verify at 46 px, not at 4K |
| Texture memory blows past 24 MB | One atlas per asset family, 512 max, no normal maps on props |
| Draw calls climb with density | Instanced stock, merged static room, one atlas per bay |
| The look drifts warm-but-generic | Grade against the three locked concept frames, not against memory |
