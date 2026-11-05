# Pharm Chris — 3D Arcade-Idle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform *Pharm Chris* from a first-person 3D simulator into a high-end, responsive 3D arcade-idle game (benchmarked against *Idle Lumberjack 3D*) in Three.js, preserving the 90-day Lagos story, Uncle Segun / Chief Okonkwo ₦4.2M debt clock, MAS scratch verification, and regulatory raids.

**Architecture:**
- **Decoupled Simulation Engine (`src/sim/`):** Maintain all 51 passing unit tests and business logic intact (`engine.ts`, `customers.ts`, `endgame.ts`, `prng.ts`). The arcade UI layer observes state and dispatches actions without contaminating pure game logic.
- **Isometric 3D Viewport & Camera (`src/ui/arcade/ArcadeViewport.ts`):** 45-degree top-down isometric view with smooth camera dampening following player Chris. Fully responsive layout adapting between mobile portrait (360px–430px) and desktop widescreen.
- **Player Controller & Dynamic Stacking Socket (`src/ui/arcade/ArcadePlayer.ts`):** Dual input (floating virtual joystick on mobile touch + `WASD`/Arrow keys on desktop). Stylized low-poly Chris model with procedural bounce and a dynamic box stack on his back/arms that tilts and sways with inertia.
- **Proximity Trigger System (`src/ui/arcade/TriggerPad.ts`):** Stand-in interaction zones for Delivery Dock, Shelf Restocking, Counter Cashier, Cash Pickup, and Floor Upgrade Pads.
- **Customer Queue & Hybrid Sales (`src/ui/arcade/ArcadeCustomerManager.ts`):** Walkable queue line from street entrance to service counter, overhead floating bubble sprites, instant auto-serve proximity triggers, and modal overlays for story-branch customers.
- **Economy & Juice Engine (`src/ui/arcade/JuiceSystem.ts`):** 3D bouncing Naira note stacks with magnet pickup, floating text particles (`+₦2,500`), circular progress unlock rings, and Web Audio sound effects.

**Tech Stack:** Three.js, Vite, TypeScript, Vitest, Web Audio API.

**Spec:** `Downloads/Pharmacy Game Story and Core Loop Brief.docx` and `C:/Users/hp/pharm-chris/src/sim/types.ts`.

## Global Constraints
- Simulation engine in `src/sim/` must remain pure TypeScript with zero DOM/Three.js dependencies.
- Responsive across all viewports: mobile portrait (min 360px), tablet, and desktop widescreen.
- Controls must support both touch drag (virtual joystick) and keyboard (`WASD`/arrows).
- Counter interactions must follow the hybrid model: auto-dispense for standard customers, interactive modal for story negotiations.
- Build and test passes with 0 lint/type errors (`npm run build && npm test`).

## Review Focus
1. **Virtual Joystick & Touch Collision:** Touch events must not conflict with browser scrolling or pinch-to-zoom on mobile.
2. **Stack Physics Performance:** Stacking 10+ boxes on player's back must use instancing or pooled group transforms to avoid draw call bloat.
3. **Customer Pathing / Queue Stalls:** Queuing customers must smoothly step forward when the front customer departs without overlapping or getting stuck.
4. **Audio Context Initialization:** Web Audio must resume gracefully on first user touch/click without browser autoplay blocks.
5. **State Synchronization with Engine:** When days transition or events trigger (e.g. Day 45 inspection), 3D environment and UI state must update cleanly without orphaned meshes.

---

### Task 1: Responsive Arcade Viewport & Low-Poly Pharmacy Scene

**Files:**
- Create: `src/ui/arcade/ArcadeViewport.ts`
- Create: `src/ui/arcade/ArcadeScene.ts`
- Test: `tests/arcade/viewport.test.ts`

**Interfaces:**
- Produces: `ArcadeViewport` class with `mount(container: HTMLElement)`, `resize()`, `render()`, `camera`, `scene`, `renderer`.

- [ ] **Step 1: Write test for viewport initialization and aspect ratio calculations**
- [ ] **Step 2: Run test to verify it fails (`npx vitest run tests/arcade/viewport.test.ts`)**
- [ ] **Step 3: Implement `ArcadeViewport.ts` and `ArcadeScene.ts`** with soft ambient lighting, directional shadow caster, warm Lagos palette (brick tile floor, teal walls, teak counter perimeter, street doorway).
- [ ] **Step 4: Verify test passes and canvas mounts cleanly**
- [ ] **Step 5: Commit `feat: arcade viewport and base isometric scene`**

---

### Task 2: Arcade Player Controller & Dual Input System

**Files:**
- Create: `src/ui/arcade/InputController.ts`
- Create: `src/ui/arcade/ArcadePlayer.ts`
- Test: `tests/arcade/player.test.ts`

**Interfaces:**
- Consumes: `ArcadeViewport` (scene, camera)
- Produces: `ArcadePlayer` with `update(delta: number)`, `position: Vector3`, `move(dir: Vector2)`, `speed: number`.

- [ ] **Step 1: Write unit tests for `InputController` (keyboard vector + virtual joystick vector normalization)**
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Implement `InputController` and `ArcadePlayer`** (low-poly stylized Chris with running wobble, forward rotation, boundary clamping to pharmacy walls, on-screen touch joystick overlay).
- [ ] **Step 4: Verify tests pass**
- [ ] **Step 5: Commit `feat: dual input controller and arcade player character`**

---

### Task 3: Medicine Stacking System & Physics Socket

**Files:**
- Create: `src/ui/arcade/MedicineStack.ts`
- Create: `src/ui/arcade/BoxMeshPool.ts`
- Test: `tests/arcade/stack.test.ts`

**Interfaces:**
- Consumes: `ArcadePlayer`
- Produces: `MedicineStack` with `push(product: Product): boolean`, `pop(): Product | null`, `count: number`, `maxCapacity: number`.

- [ ] **Step 1: Write unit tests for capacity clamping, push, pop, and stack offset math**
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Implement `MedicineStack.ts` and `BoxMeshPool.ts`** (distinct colors per category: Red=Antimalarial, Green=Analgesic, Blue=Antibiotic, Cyan=Cold Chain; procedural sway during movement).
- [ ] **Step 4: Verify tests pass**
- [ ] **Step 5: Commit `feat: dynamic box stack socket and mesh pooling`**

---

### Task 4: Proximity Zones & Restocking Loop

**Files:**
- Create: `src/ui/arcade/TriggerZone.ts`
- Create: `src/ui/arcade/PharmacyShelves3D.ts`
- Test: `tests/arcade/zones.test.ts`

**Interfaces:**
- Consumes: `ArcadePlayer`, `MedicineStack`, `PharmChrisEngine`
- Produces: `TriggerZoneManager` handling loading dock and 4 category shelf zones.

- [ ] **Step 1: Write test for proximity detection and rate-limited item transfer**
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Implement `TriggerZone.ts` and `PharmacyShelves3D.ts`** (visual floor pulsing rings, parabolic box flying animation from crate -> player -> shelf, inventory count sync).
- [ ] **Step 4: Verify tests pass**
- [ ] **Step 5: Commit `feat: trigger zones and shelf restock loop`**

---

### Task 5: Customer Queuing & Hybrid Counter Interaction

**Files:**
- Create: `src/ui/arcade/ArcadeCustomer.ts`
- Create: `src/ui/arcade/ArcadeCustomerQueue.ts`
- Create: `src/ui/arcade/DialogueModal.ts`
- Test: `tests/arcade/customer_queue.test.ts`

**Interfaces:**
- Consumes: `PharmChrisEngine`, `PharmacyShelves3D`
- Produces: `ArcadeCustomerQueue` with queue progression, customer spawning, auto-serve trigger, and story dialogue modal popup.

- [ ] **Step 1: Write tests for customer queue ordering, arrival, and departure states**
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Implement queue management, floating overhead symptom sprites, auto-checkout when stocked, and hybrid modal for story customers (Mama Ngozi, Emeka)**
- [ ] **Step 4: Verify tests pass**
- [ ] **Step 5: Commit `feat: customer queue and hybrid checkout system`**

---

### Task 6: Cash Physics, Magnet Pickup & Circular Floor Upgrade Pads

**Files:**
- Create: `src/ui/arcade/CashDropManager.ts`
- Create: `src/ui/arcade/FloorUpgradePad.ts`
- Test: `tests/arcade/upgrades.test.ts`

**Interfaces:**
- Consumes: `PharmChrisEngine`, `ArcadePlayer`
- Produces: `FloorUpgradePad` (radial fill shader/mesh), `CashDropManager` (3D Naira note stacks with magnet lerp).

- [ ] **Step 1: Write tests for upgrade cost deductions, radial fill percentages, and unlock triggers**
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Implement Naira bill drops at checkout counter, magnet collection into player wallet, and floor pads: [Speed +25%], [Stack +5], [Hire Sade], [Pay Debt ₦150k]**
- [ ] **Step 4: Verify tests pass**
- [ ] **Step 5: Commit `feat: cash drops and arcade floor upgrade pads`**

---

### Task 7: Full Story & Season Integration (Days 1–90 Loop)

**Files:**
- Create: `src/ui/arcade/ArcadeGameDirector.ts`
- Modify: `src/main.ts`
- Test: `tests/arcade/director.test.ts`

**Interfaces:**
- Consumes: `PharmChrisEngine`, all arcade components
- Produces: Main game loop running morning delivery unboxing -> day rush -> evening ledger -> debt milestone events.

- [ ] **Step 1: Write test for day lifecycle transitions and shock/inspection triggers**
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Wire `ArcadeGameDirector` to `src/main.ts`, tying engine events to 3D arcade scene: Inspector Danjuma walking in, morning crate inspection UI, evening tally & debt counter**
- [ ] **Step 4: Verify tests pass**
- [ ] **Step 5: Commit `feat: full season game director and engine synchronization`**

---

### Task 8: Web Audio SFX, Visual Juice & Final Verification

**Files:**
- Create: `src/ui/arcade/ArcadeJuice.ts`
- Modify: `src/audio/sfx.ts`
- Modify: `index.html`

- [ ] **Step 1: Implement floating text particle pool (`+₦5,000`, `TRUST +1`), confetti bursts on upgrade unlock, squash-and-stretch mesh deform on box catch**
- [ ] **Step 2: Implement arcade Web Audio synthesized chimes (cash register clink, box swoosh, level up fanfare, Lagos ambient street audio)**
- [ ] **Step 3: Verify responsive layout on mobile viewport (360x740) and desktop (1920x1080) in browser**
- [ ] **Step 4: Run full test suite (`npm run build && npm test`)**
- [ ] **Step 5: Commit `feat: arcade audio sfx, juice particles, and production build`**
