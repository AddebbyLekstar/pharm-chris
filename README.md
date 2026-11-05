# PHARM CHRIS — 3D ARCADE IDLE PHARMACY

**Project:** Pharm Chris — 3D Arcade Idle Pharmacy  
**Author:** Lekan Elewuro  
**Directory:** `C:\Users\hp\pharm-chris`  

---

## 1. Architectural Highlights

- **Zero-Dependency TypeScript Simulation Engine (`src/sim/engine.ts`):**
  - Pure, headless domain logic isolated completely from the UI/DOM.
  - Deterministic PRNG via Mulberry32 algorithm (`src/sim/prng.ts`), enabling seed reproducibility and automated bot test harness runs.
  - Explicit types and `saveVersion: 1` state serialization schema (`src/sim/types.ts`).

- **Content Data Layer (`src/content/products.json` & `src/sim/customers.ts`):**
  - 11 fictional pharmaceutical products referenced from the dossier: *Painaway 500, FeverEase Extra, Malaguard Forte, Coughcalm Elixir, Stomacare Suspension, KidEase Paediatric, Clavumed 625, BP-Steady 5, Wounda-Seal, Vitaboost Complex, Chillvial Safe*.
  - Includes authentic pricing baselines, therapeutic classifications, prescription flags (`requiresPrescription`), cold chain status, and MAS scratch-code compliance.
  - Rich dialogue matrix reflecting authentic Nigerian comedic street pharmacy dynamics (Mama Ngozi, Bayo Driver, Alabi Fintech, Iya Basira).

- **16-bit Retro Pixel Art Aesthetic & Tactile Interaction:**
  - Mobile portrait viewport (360px base, max 440px centered, responsive).
  - Lagos indexed retro palette: Terracotta (`#6A2411`/`#B84A28`), Eucalyptus (`#1B5E3C`/`#329663`), Warm Cream (`#F4EBD9`/`#FFF9EE`), Brass Gold (`#D49826`), and Pixel Dark (`#121113`).
  - Chunky borders, pixel-art medicine bottle sprites, and >=48px tap targets.
  - Interactive Margin Slider with dynamic Fair Price Band indicator (15%–35% green zone, real-time warning on gouging).
  - Dual payment triggers: **Cash** (notes & cash register drawer chime) and **POS Transfer** (terminal beep & receipt).
  - Synthesized Web Audio API sound generator (`src/audio/sfx.ts`) delivering 8-bit sound effects (register bell, POS beeps, error buzz, shelf clicks, and success chimes) + `navigator.vibrate` haptic feedback without any heavy external audio files.
  - Floating Naira delta animations and toast notifications featuring Mama Ngozi's dialogue, Tola's color commentary, trust balance changes, and receipt numbers.
  - Continuous replayability via **Next Customer** and **Reset** buttons.

---

## 2. Directory Structure

```
C:\Users\hp\pharm-chris\
├── index.html                     # HTML5 shell & Google Fonts (Silkscreen, Space Grotesk)
├── package.json                   # Dependencies (Vite, TypeScript, Vitest)
├── tsconfig.json                   # Strict TypeScript compiler configuration
├── vite.config.ts                 # Fast Vite bundle config
├── dist/                          # Production build output ready for preview/deployment
└── src/
    ├── main.ts                    # UI application controller & event binder
    ├── audio/
    │   └── sfx.ts                 # Synthesized 8-bit Web Audio API engine + haptics
    ├── content/
    │   └── products.json          # 11 fictional pharmaceutical products catalog
    ├── sim/
    │   ├── types.ts               # Core domain models, state interfaces & dialogue matrix
    │   ├── prng.ts                # Deterministic Mulberry32 pseudorandom generator
    │   ├── customers.ts           # Customer characters & dialogue scripts
    │   ├── engine.ts              # Pure simulation engine (inventory, margins, trust)
    │   └── __tests__/
    │       └── engine.test.ts     # Automated unit tests (Vitest: 7/7 passing)
    └── ui/
        └── style.css              # 16-bit retro pixel CSS, color tokens & animations
```

---

## 3. How to Run Locally

1. **Development Server:**
   ```bash
   cd C:/Users/hp/pharm-chris
   npm run dev
   ```
   Open `http://localhost:3000` in any browser or mobile simulator.

2. **Run Automated Test Suite:**
   ```bash
   cd C:/Users/hp/pharm-chris
   npm test
   ```
   Runs all 7 simulation tests verifying PRNG reproducibility, fair band calculation, successful transactions, gouging penalties, and customer cycling.

3. **Production Build & Preview:**
   ```bash
   cd C:/Users/hp/pharm-chris
   npm run build
   npm run preview
   ```
