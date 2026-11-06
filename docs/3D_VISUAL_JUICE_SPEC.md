# Pharm Chris — 3D Visual & Juice Specification
**Role:** Design Lead (@hinata)
**Target Engine:** Three.js (WebGL 2.0 / WebGL 1.0 fallback) + TypeScript
**Aesthetic:** Stylized Isometric Arcade-Idle (Benchmarked against *Idle Lumberjack 3D*, *My Little Universe*, and authentic Lagos pharmacy aesthetics)

---

## 1. Stylized Low-Poly Character Models & Procedural Parts

### 1.1 Proportions & Anatomy Architecture
Characters use a stylized, top-heavy silhouette optimized for a 45-degree isometric camera angle (orthographic or low-FOV perspective). Characters are built out of clean, beveled or low-poly geometric primitives to minimize draw calls while maintaining an expressive toy-like aesthetic.

* **Total Height:** 2.1 units
* **Head-to-Body Ratio:** ~1:3.2 (chibi / stylized arcade proportions)
* **Geometric Breakdown:**
  * **Head:** Width `0.48`, Height `0.48`, Depth `0.48` (`BoxGeometry` with rounded bevel or `DodecahedronGeometry(0.28, 1)`).
  * **Torso:** Width `0.72` (shoulders) tapering to `0.60` (waist), Height `0.88`, Depth `0.44`. Pivot set at base of hips (`y = 0.90`).
  * **Arms (Left/Right):** Width `0.18`, Height `0.72`, Depth `0.18`. Pivot at shoulder joint (`y = 1.35, x = \pm 0.46`).
  * **Legs (Left/Right):** Width `0.22`, Height `0.75`, Depth `0.22`. Pivot at hip joint (`y = 0.75, x = \pm 0.18`).
  * **Feet/Shoes:** Width `0.24`, Height `0.16`, Depth `0.34` (extended forward `+0.06` for clear ground contact reading).

### 1.2 Character Palette & Lagos Fashion Token Library

| Character / Archetype | Role | Skin Material | Garment Materials | Distinctive Cultural Accessories |
| :--- | :--- | :--- | :--- | :--- |
| **Pharm Chris** (Protagonist) | Pharmacist Owner | `#3E2312` (Melanin Deep Rich, Roughness `0.62`, Metalness `0.02`) | **Lab Coat:** `#F8FAF9` (Crisp clinic white, Roughness `0.35`).<br>**Trousers:** `#0D4A3E` (Dark Lagos teal scrub pants). | Gold-rim retro aviators (`#D4AF37`, Metalness `0.85`, Roughness `0.2`). Stethoscope draped around neck (`#1E293B`, tubing radius `0.022`). Official PSN green badge (`#00E676`) on left breast pocket. |
| **Mama Ngozi** (Loyal Matriarch) | Recurring VIP / Story | `#532E17` (Warm Umber, Roughness `0.65`) | **Ankara Wrapper & Buba:** `#F57C00` base with `#D84315` and `#FFD54F` geometric wax print pattern. | Oversized sculpted Gele head-tie (`0.65 x 0.32 x 0.65`, tilted 8° back, `#BF360C`). Coral bead necklace (`#FF5722`, instanced spheres radius `0.035`). |
| **Emeka** (Okada Express) | Courier / Delivery Dispatch | `#452814` (Deep Espresso, Roughness `0.60`) | **Rider Jersey:** `#FDD835` (High-vis Lagos yellow, Roughness `0.45`).<br>**Jeans:** `#1A237E` (Dark washed denim). | Glossy black motorcycle helmet (`#1A1A1A`, Roughness `0.15`, Metalness `0.3`) pushed up on forehead. Reflective nylon cross-body messenger pouch (`#00E676`). |
| **Bayo** (Danfo Driver) | Hurried Commuter | `#3B200F` (Dark Mahogany, Roughness `0.68`) | **Danfo Vest:** `#FBC02D` with dual horizontal black racing stripes (`#111111`). | Red tooth-pick (`#D32F2F`) angled out of mouth corner. Rolled newsboy cap (`#5D4037`). Towel draped over left shoulder (`#EEEEEE`). |
| **Alhaji Danjuma** (PCN Inspector) | Regulator / Official | `#4A2E1B` (Chestnut Bronze, Roughness `0.60`) | **Kaftan / Agbada:** `#1E293B` (Authoritative dark navy slate, crisp crease lines). | Embroidered Fula cap (`#D4AF37` gold thread geometric trim on `#0F172A`). Wireframe clipboard (`0.30 x 0.42 x 0.04`, wood `#8D6E63`, clip `#CFD8DC`). |

### 1.3 Procedural Mesh Construction (Three.js Part Hierarchy)
```typescript
// Base Stylized Character Mesh Tree:
// Group (Character Root)
// ├── Mesh (Contact Shadow — CircleGeometry, MeshBasicMaterial, y = 0.005)
// ├── Group (Body Root — Bobbing / Sway Pivot)
// │   ├── Mesh (Pelvis & Trousers — BoxGeometry)
// │   ├── Mesh (Torso & Tunics / Lab Coat — BoxGeometry / ExtrudeGeometry)
// │   ├── Group (Left Arm Socket — Pivot at shoulder [x: -0.46, y: 1.35, z: 0])
// │   │   └── Mesh (Left Upper & Forearm)
// │   ├── Group (Right Arm Socket — Pivot at shoulder [x: +0.46, y: 1.35, z: 0])
// │   │   └── Mesh (Right Upper & Forearm)
// │   ├── Group (Head Socket — Pivot at neck [y: 1.55])
// │   │   ├── Mesh (Head Cranium — Beveled Box)
// │   │   ├── Mesh (Hair / Gele / Helmet / Cap)
// │   │   └── Mesh (Glasses / Accessories)
// │   └── Group (Stack Socket — Positioned behind torso [0, 1.25, -0.32])
// ├── Group (Left Leg Socket — Pivot at hip [x: -0.18, y: 0.75, z: 0])
// │   └── Mesh (Left Leg & Shoe)
// └── Group (Right Leg Socket — Pivot at hip [x: +0.18, y: 0.75, z: 0])
//     └── Mesh (Right Leg & Shoe)
```

---

## 2. Environment & Lighting Setup

### 2.1 Color Palette & Lagos Atmospheric Tone
To evoke a bright, humid, sun-drenched Lagos morning transitioning into a bustling commercial afternoon, the scene balances warm golden sunlight (`#FFEED6`), cool tropical bounce (`#B5E2FF`), and the signature deep clinical teal (`#0D4A3E`) and teak woodwork (`#3E2723`) of established Nigerian community pharmacies.

### 2.2 Three.js Lighting Matrix

| Light Type | Color Hex | Intensity | Position `(x, y, z)` | Cast Shadow | Shadow Map / Bias Parameters | Function |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **DirectionalLight** (Sun) | `#FFEED6` | `1.75` | `(12.0, 22.0, 14.0)` | **Yes** | `mapSize: 2048x2048`<br>`camera.near: 0.5`<br>`camera.far: 55`<br>`ortho bounds: d = 16`<br>`bias: -0.0004`<br>`normalBias: 0.02` | Primary sun cutting 45° crisp isometric shadows towards the back-left. |
| **HemisphereLight** | Sky: `#B5E2FF`<br>Ground: `#3D2716` | `0.45` | `(0, 20.0, 0)` | No | N/A | Simulates sky ambient fill and warm terrazzo floor bounce. |
| **PointLight** (Counter Spot) | `#FFF3DB` | `1.50` | `(0.0, 3.8, 1.5)` | No | `distance: 14.0`<br>`decay: 1.1` | Spotlights the dispensary transaction counter and customer face. |
| **PointLight** (Green Cross Glow) | `#00E676` | `0.65` | `(0.0, 3.2, -7.5)` | No | `distance: 10.0`<br>`decay: 1.5` | Back-wall medical neon glow characteristic of Lagos pharmacy crosses. |
| **AmbientLight** | `#FFF7EC` | `0.90` | N/A | No | N/A | Lifts high-contrast shadows to prevent muddy occlusions. |

### 2.3 Architectural Materials & Floor Spec

* **Floor (Terrazzo Tile):**
  * Dimensions: `16.0m` width x `18.0m` depth (`PlaneGeometry(16, 18)`).
  * Material: `MeshStandardMaterial` (`color: 0xF4F1EA`, `roughness: 0.32`, `metalness: 0.04`).
  * Procedural Grout Grid: Fine subdivision lines spaced at `1.0m` intervals (`gridHelper` or canvas shader overlay with `#DDD6C8` line color at `0.001` y-offset) to ground arcade movement and distance perception.
  * Perimeter Skirting / Border: Width `0.6m`, Height `0.02m` (`color: 0x182E24`, `roughness: 0.55`).

* **Dispensary Counter:**
  * Base Counter: `BoxGeometry(4.8, 1.15, 0.95)`, Position `(0, 0.575, 1.6)`.
  * Lower Cladding: Solid Nigerian Teak wood panels (`color: 0x4E342E`, `roughness: 0.65`, `metalness: 0.05`).
  * Countertop Slab: Beveled ivory laminate (`BoxGeometry(5.0, 0.12, 1.1)`, `color: 0xF7FAFC`, `roughness: 0.20`, `metalness: 0.08`).
  * Glass Sneeze Guard / Partition: `BoxGeometry(4.4, 0.75, 0.06)`, `MeshPhysicalMaterial` (`color: 0xE0F7FA`, `transmission: 0.92`, `opacity: 1.0`, `transparent: true`, `roughness: 0.08`, `ior: 1.52`). Center service opening: `1.2m` wide.

* **Medicine Shelving Units (Bays):**
  * Bay Dimensions: Width `1.6m`, Height `2.6m`, Depth `0.85m`. Four tiers per bay (spacing `0.55m`).
  * Material: Powder-coated forest teal steel uprights (`color: 0x1B4D3E`, `roughness: 0.40`) with warm wood shelves (`color: 0x5D4037`, `roughness: 0.70`).
  * Cold Chain Refrigerator Bay: Width `1.5m`, Height `2.4m`, Depth `0.9m` (`color: 0xDDEEFF`, `metalness: 0.25`, `roughness: 0.25`) with internal blue LED backlight (`#00E5FF`, `intensity: 0.8`).

* **Contact Shadow Decal:**
  * Mesh: `CircleGeometry(radius, 32)`.
  * Material: `MeshBasicMaterial` (`color: 0x0A120E`, `transparent: true`, `opacity: 0.32`, `depthWrite: false`). Positioned at `y = 0.005` with `renderOrder = 1`. Scales dynamically with character jump/bounce height ($1 - y_{lift} \times 0.25$).

---

## 3. Animation, Procedural Kinematics & Physics Math

### 3.1 Stylized Bounce-Walk Cycle
To achieve the punchy, tactile arcade feel of top mobile idle titles, walking is animated procedurally via sinusoidal trigonometry rather than heavy skeletal rigs. This guarantees zero blend-tree pops during rapid direction changes.

Let $v$ be current player velocity magnitude ($0 \le v \le v_{max}$), where $v_{max} = 6.5\,\text{m/s}$.
Let normalized walk progress be $\theta(t) = \theta(t - \Delta t) + \Delta t \cdot \omega$, where frequency $\omega = 14.5\,\text{rad/s}$ (approx. $2.3\,\text{Hz}$).

1. **Vertical Body Bobbing (Squash & Stretch):**
   $$y_{\text{bounce}}(t) = |\sin(\theta(t))| \cdot A_y \cdot \left(\frac{v}{v_{max}}\right)$$
   * Parameter $A_y = 0.12\,\text{units}$.
   * Scale Compensation: $S_y = 1.0 + \sin(2\theta) \cdot 0.06$, $S_x = S_z = 1.0 / \sqrt{S_y}$ (volume preservation).

2. **Hip Roll / Body Tilt:**
   $$\text{Rotation}_z(t) = \sin(\theta(t)) \cdot 0.075\,\text{rad} \quad (\approx 4.3^\circ)$$
   $$\text{Forward Pitch}_x(t) = -0.12 \cdot \left(\frac{v}{v_{max}}\right)\,\text{rad} \quad (\text{leaning eagerly into movement})$$

3. **Opposed Limb Swing:**
   $$\text{Leg}_L = \sin(\theta(t)) \cdot 0.55\,\text{rad}, \quad \text{Leg}_R = -\sin(\theta(t)) \cdot 0.55\,\text{rad}$$
   $$\text{Arm}_L = -\sin(\theta(t)) \cdot 0.42\,\text{rad}, \quad \text{Arm}_R = \sin(\theta(t)) \cdot 0.42\,\text{rad}$$
   *(When carrying a stack, arm rotation locks forward at $\text{Arm}_X = -0.65\,\text{rad}$ to cradle the boxes).*

### 3.2 Stack Inertia Sway Physics (Spring-Damper Chain Math)
Carrying up to 10 cartons of medicine creates a dynamic, delightful tower that sways in reaction to player acceleration, turning angular velocity, and footfall impacts.

Each box $i \in [0, N-1]$ in the stack (where $i=0$ is the bottom box mounted at socket `y = 0` and spacing $h = 0.24\,\text{m}$) calculates its tilt using a critically damped 2nd-order harmonic spring with cumulative height multipliers:

$$\vec{a}_{\text{player}} = \frac{\vec{v}(t) - \vec{v}(t - \Delta t)}{\Delta t}$$

For each box $i$, its target angular deflection $\vec{\theta}^*_i$ is driven by negative player horizontal acceleration and centrifugal turn torque:
$$\theta^*_{x, i} = -\text{clamp}(a_z \cdot k_{\text{inertia}}, -0.45, 0.45) \cdot (1.0 + i \cdot 0.35)$$
$$\theta^*_{z, i} = +\text{clamp}(a_x \cdot k_{\text{inertia}}, -0.45, 0.45) \cdot (1.0 + i \cdot 0.35)$$

* Spring Constant $k_{\text{spring}} = 38.0$
* Damping Factor $c = 2 \cdot \sqrt{k_{\text{spring}}} \approx 12.33$ (critical damping prevents unnatural jelly oscillation)
* Step update:
  $$\Delta \theta_i = \theta^*_i - \theta_i$$
  $$\text{accel}_i = k_{\text{spring}} \cdot \Delta \theta_i - c \cdot \omega_i$$
  $$\omega_i \leftarrow \omega_i + \text{accel}_i \cdot \Delta t$$
  $$\theta_i \leftarrow \theta_i + \omega_i \cdot \Delta t$$
* Lateral Offset Displacement (Curved Spine Effect):
  $$\text{pos}_{x, i} = \sin(\theta_{z, i}) \cdot (i \cdot 0.08)$$
  $$\text{pos}_{z, i} = -\sin(\theta_{x, i}) \cdot (i \cdot 0.08)$$

### 3.3 Box Pickup & Restock Parabolic Flight Arcs
When taking boxes from the delivery dock or dispensing to shelves, boxes do not teleport; they fly along a 3D quadratic Bezier trajectory with rotational tumble.

* **Trajectory Function:**
  $$\vec{P}(t) = (1 - u)^2 \vec{P}_{\text{start}} + 2(1 - u)u \vec{P}_{\text{control}} + u^2 \vec{P}_{\text{target}}$$
  where $u = \text{EaseOutQuad}(t / T_{\text{duration}})$, with $T_{\text{duration}} = 0.38\,\text{seconds}$.
* **Arc Peak Height:**
  $$\vec{P}_{\text{control}} = \frac{\vec{P}_{\text{start}} + \vec{P}_{\text{target}}}{2} + \begin{bmatrix} 0 \\ H_{\text{arc}} \\ 0 \end{bmatrix}, \quad H_{\text{arc}} = 1.45\,\text{m}$$
* **Rotation Spin:**
  $$\text{Rot}_y(u) = \text{Lerp}(0, \pi, u), \quad \text{Rot}_x(u) = \sin(u \cdot \pi) \cdot 0.4\,\text{rad}$$
* **Landing Impact Squash:**
  Upon reaching $u = 1.0$, the receiving stack or shelf triggers an elastic scale punch:
  $$S_y = 0.75, \quad S_x = S_z = 1.18 \implies \text{recovers to } 1.0 \text{ in } 0.15\,\text{s via ElasticOut}$$

---

## 4. Juice VFX & UI Tokens

### 4.1 Floating Naira Currency Arc System
When a customer completes a purchase, cash bursts from the counter register in 3D Naira bundles and magnetic coin particle arcs.

* **Naira Cash Stack Mesh Spec:**
  * Dimensions: Width `0.45`, Height `0.14`, Depth `0.28` (`BoxGeometry`).
  * Palette: Rich Nigerian Central Bank polymer green (`#2E7D32`, Roughness `0.30`, Metalness `0.05`).
  * Currency Band: Center belly-band strap `0.10m` wide (`#FFF9C4` crisp ivory paper).
  * Idle Float: Floats `0.22m` above ground with rotation `2.8 rad/s` and sinusoidal bobbing $\pm 0.08\,\text{m}$.

* **Magnetic Attraction Curve (Vacuum to Chris):**
  When player enters collection radius ($r_{\text{pickup}} = 2.4\,\text{m}$):
  Let distance ratio be $d = \|\vec{P}_{\text{player}} - \vec{P}_{\text{cash}}\| / r_{\text{pickup}}$.
  Velocity accelerates aggressively toward player position:
  $$\vec{v}_{\text{cash}}(t) = \vec{v}_{\text{cash}} + (\vec{P}_{\text{player}} - \vec{P}_{\text{cash}}) \cdot \left(18.0 / (d + 0.1)\right) \cdot \Delta t$$
  Upon arrival ($d < 0.2\,\text{m}$):
  1. Mesh despawns into pool.
  2. Triggers floating text popup.
  3. Plays pleasant high-register Web Audio coin chime (`1046.5Hz` -> `1318.5Hz` -> `1567.9Hz` arpeggio).

### 4.2 Radial Floor Upgrade Pads
Interactive floor zones (e.g. *Unlock Fast Feet*, *Expand Shelves*, *Hire Boy Assistant*) use double-ring pulsing decals.

* **Geometry & Material Architecture:**
  * **Outer Pulsing Ring:** `RingGeometry(inner: 1.15, outer: 1.45, thetaSegments: 48)`.
    Material: `MeshBasicMaterial` (`color: 0xFFB300`, `transparent: true`, `opacity: 0.55`, `depthWrite: false`).
    Pulse Equation: $\text{Scale}(t) = 1.0 + \sin(3.5 \cdot t) \cdot 0.05$.
  * **Inner Fill Disc:** `CircleGeometry(radius: 1.10, segments: 48)`.
    Material: `MeshBasicMaterial` (`color: 0x00E676`, `transparent: true`, `opacity: 0.75`).
    Scale starts at `(0.001, 0.001, 1)` and scales radially outward proportional to payment completion progress $\rho \in [0, 1]$.
  * **Vertical Holographic Beaming Cylinder (Active State):**
    `CylinderGeometry(radiusTop: 1.4, radiusBottom: 1.4, height: 2.2, radialSegments: 32, openEnded: true)`.
    Material: `MeshBasicMaterial` (`color: 0x00E676`, `transparent: true`, `opacity: 0.15`, `side: DoubleSide`).

* **Charging Dynamic:**
  * Charge Duration: $T_{\text{charge}} = 1.25\,\text{seconds}$ continuous dwell.
  * Cash Draining: Incremental deduction of total cost ($C$) streaming at rate $\Delta C = \frac{C}{T_{\text{charge}}} \cdot \Delta t$.
  * Exit Decay: If player steps outside before completion, progress decays backward at $0.6\,\times$ charge speed to allow repositioning without total penalty.

### 4.3 Overhead Speech & Symptom Bubble Billboards
Customers in queue project stylized 3D thought bubbles indicating their medical needs or negotiation state.

* **Billboard Structure:**
  * Three.js Sprite or plane mesh anchored at customer head offset `(0, 2.35, 0)` with `.lookAt(camera.position)`.
  * Backplate: Rounded speech bubble frame (`color: #FFFFFF`, drop-shadow `rgba(0,0,0,0.3)`).
  * Icon Token Specs:
    * **Malaria Parasite Indicator:** Crimson droplet with yellow halo (`#E53935` / `#FDD835`).
    * **Throbbing Headache / Analgesic:** Yellow lightning burst (`#FFB300`).
    * **Cough / Antibiotic:** Cyan bronchial cloud (`#00ACC1`).
    * **Cold Chain Insulin:** Frosted snowflake with ice blue glow (`#80D8FF`).
    * **Haggling / Money Icon:** Green Naira badge (`#2E7D32`, `₦` glyph).
* **Entrance & Departure Animation:**
  * Pop-in: Scale from `0.0` to `1.2` in `0.18s` (`BackOut` easing), settling at `1.0`.
  * Floating Idle: Vertical hover $\Delta y = \sin(4t) \cdot 0.04\,\text{m}$.
  * Pop-out on checkout: Scale to `1.3` -> `0.0` in `0.12s` with mini sparkle burst.

### 4.4 Floating Combat/Economy Text Tokens
Screen-space or world-projected typography providing instant feedback for transactions, tips, and inventory warnings.

| Token Type | Text Example | Color Hex | CSS / Shader Styling | Motion Trajectory | Lifetime |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Cash Earned** | `+₦4,500` | `#00E676` | Font: Inter / Outfit 900.<br>Stroke: `2px #0A3618`.<br>Glow: `0 0 12px #00E676`. | Spawns at `(0, 1.8, 1.6)`. Drifts vertically $+1.2\,\text{m}$, scales `1.0 -> 1.25 -> 0.9`, fades out via `CubicOut`. | `0.85s` |
| **Stock Depleted** | `OUT OF STOCK!` | `#FF1744` | Font: Outfit 900.<br>Stroke: `2px #40000A`.<br>Glow: `0 0 14px #FF1744`. | Shakes horizontally (±6px, 15Hz) while drifting upward. | `1.10s` |
| **VIP Story / Quest** | `MAMA NGOZI!` | `#FFB300` | Font: Outfit 900 uppercase.<br>Gold metallic sheen. | Expands from center screen with golden star particle spray. | `1.50s` |
| **Speed Boost** | `FAST DISPENSE!` | `#00E5FF` | Font: Outfit 800 italic.<br>Cyan motion trail. | Follows player head with trailing horizontal stretch. | `0.75s` |

### 4.5 Camera Shake & Tactile Haptic Profile
* **Screen Shake Engine:**
  * Decay rate: $\lambda = 3.2\,\text{s}^{-1}$.
  * Formula per frame: $\vec{O}_{\text{shake}} = \text{random}(-1, 1) \cdot I \cdot e^{-\lambda t}$.
  * Event Presets:
    * Cash collect: $I = 0.04\,\text{units}$ (subtle pop).
    * Shelf restock punch: $I = 0.08\,\text{units}$.
    * Pad unlock complete: $I = 0.22\,\text{units}$.
    * Regulatory raid / NAFDAC alarm: $I = 0.45\,\text{units}$ sustained with red ambient flash.
* **Mobile Haptic Feedback (`navigator.vibrate`):**
  * Light tick (coin collect): `8ms`.
  * Medium thump (shelf restock): `24ms`.
  * Heavy double-pulse (upgrade unlock): `[35ms, 40ms, 60ms]`.

---

## 5. Implementation Reference Matrix for Arcade Developers

```typescript
// Quick Token Reference for src/ui/arcade/*
export const ARCADE_VISUAL_TOKENS = {
  colors: {
    melaninDark: 0x3E2312,
    melaninWarm: 0x532E17,
    labCoatWhite: 0xF8FAF9,
    lagosTeal: 0x0D4A3E,
    ankaraOrange: 0xF57C00,
    ankaraRust: 0xD84315,
    okadaYellow: 0xFDD835,
    nairaGreen: 0x00E676,
    nairaStackDark: 0x2E7D32,
    floorTile: 0xF4F1EA,
    teakWood: 0x4E342E,
    counterTop: 0xF7FAFC,
    coldChainBlue: 0x00E5FF,
  },
  dimensions: {
    playerHeight: 2.10,
    boxWidth: 0.55,
    boxHeight: 0.22,
    boxDepth: 0.38,
    boxSpacingY: 0.24,
    counterHeight: 1.15,
    shelfBayWidth: 1.60,
    upgradePadRadius: 1.40,
  },
  physics: {
    walkFrequency: 14.5,
    bounceAmplitudeY: 0.12,
    maxTiltAngleRad: 0.45,
    stackSpringK: 38.0,
    stackSpringDamping: 12.33,
    pickupArcDuration: 0.38,
    pickupArcHeight: 1.45,
  },
  easings: {
    boxFlight: 'cubic-bezier(0.25, 1, 0.5, 1)',
    coinVacuum: 'cubic-bezier(0.55, 0.055, 0.675, 0.19)',
    bubblePop: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  }
};
```
