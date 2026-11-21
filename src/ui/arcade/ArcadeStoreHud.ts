import { EMPLOYEES, EmployeeRole, LICENSE_TIERS, StoreRun, UPGRADES, UpgradeId } from '../../sim/progression';
import { Onboarding, ONBOARDING_DONE, nextObjective } from '../../sim/onboarding';
import { EndgameReport } from '../../sim/types';
import { OfflineResult, formatDuration } from '../../sim/save';
import { FunnelReport, Telemetry, downloadFunnel } from '../../sim/telemetry';
import { nairaPlainText, nairaToSvgMarkup, setNairaHtml, setNairaText } from './kit/naira';

export interface HudContext {
  stackCount: number;
  stackCapacity: number;
  queueLength: number;
  cashOnFloor: number;
  shelfStock: number;
  playerSpeedLevel: number;
}

export interface HudCallbacks {
  onPurchase: (kind: 'license' | 'upgrade' | 'staff' | 'expansion' | 'debt') => void;
  onSave: () => void;
  onNewGame: () => void;
  onEnding: (decision: 'stay' | 'leave') => void;
  onSkipTutorial?: () => void;
}

interface HudOptions {
  root: HTMLElement;
  run: StoreRun;
  telemetry: Telemetry;
  onboarding: Onboarding;
  callbacks: HudCallbacks;
  debug: boolean;
}

const money = (n: number) => `₦${Math.round(n).toLocaleString('en-NG')}`;

/** Nigerian shorthand for the HUD chips: ₦4.2M, ₦950k. Full numbers stay in the drawer. */
const compact = (n: number): string => {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `₦${(n / 1e9).toFixed(abs >= 1e10 ? 0 : 1)}b`;
  if (abs >= 1e6) return `₦${(n / 1e6).toFixed(abs >= 1e7 ? 0 : 1)}m`;
  if (abs >= 1e5) return `₦${Math.round(n / 1e3)}k`;
  return `₦${Math.round(n).toLocaleString('en-NG')}`;
};

/**
 * Static HUD chrome, exported so the naira render-boundary test runs against
 * the exact markup the game ships. Currency starts at ₦0 here and is converted
 * by the caller, like every other DOM sink in this file.
 */
export const hudShellHtml = (): string => `
      <div class="hud-top">
        <div class="topbar">
          <div class="row">
            <div class="chip chip--cash"><div class="k">Cash</div><div class="v" id="hud-cash">₦0</div></div>
            <div class="chip chip--day"><div class="k">Day</div><div class="v" id="hud-day">1 / 90</div></div>
            <div class="chip chip--stack"><div class="k">Stack</div><div class="v" id="hud-stack">0 / 5</div></div>
          </div>
          <div class="row">
            <div class="chip chip--trust"><div class="k">Trust</div><div class="v" id="hud-trust">50</div></div>
            <div class="chip chip--staff"><div class="k">Staff</div><div class="v" id="hud-staff">0</div></div>
            <div class="chip chip--debt"><div class="k">Debt</div><div class="v" id="hud-debt">₦0</div></div>
          </div>
        </div>
        <div id="pharm-objective"><span>WALK TO THE DOCK</span></div>
        <div id="pharm-toasts"></div>
      </div>
      <div class="hint"><span id="hud-hint">WASD / drag to move — hold still on a zone to act</span></div>
      <button id="pharm-invest-btn">INVEST<span class="badge" id="hud-invest-hint">licences · staff · upgrades</span></button>
      <div id="pharm-drawer">
        <header><h3>Store Investment</h3><button class="buy ghost hud-icon-btn" id="pharm-drawer-close" aria-label="Close investment drawer">×</button></header>
        <div class="body" id="pharm-drawer-body"></div>
      </div>
      <div id="pharm-debug"></div>
    `;

/**
 * Drawer markup, exported so the naira render-boundary test covers the real
 * buy buttons and wages, not a copy. Currency stays authored as ₦ here.
 */
export const drawerHtml = (r: StoreRun): string => {
  const nextTier = r.nextLicenseTier();
  const nextExpansion = r.nextExpansion();
  const upgradeRows = (Object.keys(UPGRADES) as UpgradeId[])
    .map((id) => {
      const spec = UPGRADES[id];
      const level = r.state.upgrades[id];
      const cost = r.upgradeCost(id);
      const maxed = !Number.isFinite(cost);
      return `<div class="item">
          <div><div class="t">${spec.name} <span class="s">Lv ${level}/${spec.maxLevel}</span></div><div class="s">${spec.description}</div></div>
          <button class="buy" data-buy="upgrade:${id}" ${maxed || r.cash < cost ? 'disabled' : ''}>${maxed ? 'MAX' : money(cost)}</button>
        </div>`;
    })
    .join('');

  const staffRows = (Object.keys(EMPLOYEES) as EmployeeRole[])
    .map((role) => {
      const spec = EMPLOYEES[role];
      const state = r.state.employees[role];
      const maxed = state.count >= spec.maxCount;
      return `<div class="item">
          <div><div class="t">${spec.name} <span class="s">${state.count}/${spec.maxCount}</span></div>
          <div class="s">${money(spec.dailyWage)}/day · morale ${Math.round(state.morale)}%</div></div>
          <button class="buy" data-buy="staff:${role}" ${maxed || r.cash < spec.hireCost ? 'disabled' : ''}>${maxed ? 'MAX' : `HIRE ${money(spec.hireCost)}`}</button>
        </div>`;
    })
    .join('');

  const ownedLicences = LICENSE_TIERS.filter((t) => r.state.licenses.includes(t.tier))
    .map((t) => `<span class="owned-licence">${t.name}</span>`)
    .join(' · ');

  return `
      <div class="card">
        <h4>Licence desk</h4>
        ${
          nextTier
            ? `<div class="item"><div><div class="t">${nextTier.name}</div><div class="s">${nextTier.description}</div></div>
               <button class="buy" data-buy="license" ${r.cash < nextTier.cost ? 'disabled' : ''}>${money(nextTier.cost)}</button></div>`
            : `<div class="s">Every licence is open. The whole street is yours.</div>`
        }
        <div class="s" style="margin-top:6px">Owned: ${ownedLicences || 'none'}</div>
      </div>

      <div class="card">
        <h4>Upgrades</h4>
        ${upgradeRows}
      </div>

      <div class="card">
        <h4>Staff — ${money(r.dailyWages())}/day wages</h4>
        ${staffRows}
      </div>

      <div class="card">
        <h4>Floor space</h4>
        ${
          nextExpansion
            ? `<div class="item"><div><div class="t">${nextExpansion.name}</div><div class="s">${nextExpansion.description}</div></div>
               <button class="buy" data-buy="expansion" ${r.cash < nextExpansion.cost ? 'disabled' : ''}>${money(nextExpansion.cost)}</button></div>`
            : `<div class="s">Fully expanded: 90-day flagship store.</div>`
        }
      </div>

      <div class="card">
        <h4>Chief Okonkwo — ${money(r.debt)} outstanding</h4>
        <div class="s" style="margin-bottom:6px">Share of daily profit sent to the debt: <b id="debt-share-label">${Math.round(r.debtServiceShare * 100)}%</b></div>
        <input type="range" id="debt-share" min="0" max="100" step="10" value="${Math.round(r.debtServiceShare * 100)}" />
        <div class="item" style="margin-top:6px">
          <div class="s">Cash on hand ${money(r.cash)}</div>
          <button class="buy" data-buy="debt" ${r.cash <= 0 || r.debt <= 0 ? 'disabled' : ''}>PAY ${money(Math.min(r.cash, r.debt))}</button>
        </div>
      </div>

      <div class="card">
        <h4>System</h4>
        <div class="item"><div class="s">Autosaves every day and on every purchase.</div><button class="buy ghost" id="hud-save">SAVE</button></div>
        <div class="item"><div class="s">Local funnel export (no PII leaves this device).</div><button class="buy ghost" id="hud-export">EXPORT</button></div>
        <div class="item"><div class="s">Wipe the save and start a new 90-day season.</div><button class="buy ghost" id="hud-new">NEW RUN</button></div>
      </div>
    `;
};

export const hudCss = (): string => `
      /* ------------------------------------------------------------------
         Warm paper & ink HUD.

         The room is painted in sun-faded cloth tones; the HUD is the paper
         the shop runs on: cream stock, a 1px ink rule, a warm shadow and a
         whisper of grain (gradient dots, no images). Terracotta is the one
         primary action, olive reads as money coming in, brick as money owed.
         ------------------------------------------------------------------ */
      #pharm-hud, #pharm-modal-host {
        --pharm-ink: #2b2119;
        --pharm-ink-soft: #513f30;
        --pharm-ink-faint: rgba(43, 33, 25, 0.22);
        --pharm-paper: #f5e9d3;
        --pharm-paper-hi: #fbf3e2;
        --pharm-paper-lo: #e6d5b6;
        --pharm-sign: #f2e2c1;
        --pharm-terracotta: #a84a24;
        --pharm-terracotta-deep: #853818;
        --pharm-olive: #55643a;
        --pharm-brick: #9a3b2a;
        --pharm-ochre: #8a6220;
        --pharm-ochre-ink: #6d4c17;
        --pharm-denim: #4f6577;
        --pharm-cream: #fdf6e9;
        --pharm-display: 'Silkscreen', 'Press Start 2P', monospace;
        --pharm-body: 'Space Grotesk', system-ui, -apple-system, sans-serif;
        /* Paper tooth: two dot grids, 3px and 5px, at a chroma too low to read
           as pattern on a phone but enough to kill the flat plastic fill. */
        --pharm-grain: radial-gradient(rgba(90, 60, 30, 0.07) 0.5px, transparent 0.7px),
          radial-gradient(rgba(90, 60, 30, 0.05) 0.5px, transparent 0.7px);
        --pharm-shadow: 0 1px 0 rgba(43, 33, 25, 0.3), 0 5px 14px rgba(40, 25, 12, 0.28);
      }
      #pharm-hud {
        position: absolute; inset: 0; pointer-events: none; z-index: 10;
        font-family: var(--pharm-body);
        font-variant-numeric: tabular-nums;
        font-feature-settings: 'tnum' 1;
        color: var(--pharm-ink);
        -webkit-font-smoothing: antialiased;
      }

      /* ---- top cluster: one ledger band, the sign, then toasts ---- */
      #pharm-hud .hud-top {
        position: absolute; top: 10px; left: 10px; right: 10px; z-index: 12;
        display: flex; flex-direction: column; align-items: stretch; gap: 10px;
        pointer-events: none;
      }
      #pharm-hud .topbar {
        align-self: center; width: max-content; max-width: 100%;
        display: flex; justify-content: space-between; gap: 8px;
        background-color: var(--pharm-paper);
        background-image: var(--pharm-grain);
        background-size: 3px 3px, 5px 5px;
        border: 1px solid var(--pharm-ink);
        border-radius: 2px;
        padding: 2px 4px;
        box-shadow: var(--pharm-shadow);
        pointer-events: auto;
      }
      #pharm-hud .row { display: flex; align-items: stretch; min-width: 0; }
      #pharm-hud .topbar .row + .row {
        border-left: 1px solid var(--pharm-ink-faint);
        padding-left: 6px; margin-left: 6px;
      }
      #pharm-hud .chip {
        display: flex; flex-direction: column; justify-content: center;
        min-width: 0; padding: 5px 14px;
      }
      #pharm-hud .chip + .chip { border-left: 1px solid var(--pharm-ink-faint); }
      #pharm-hud .chip .k {
        font-size: 0.56rem; line-height: 1; margin-bottom: 3px;
        letter-spacing: 0.16em; text-transform: uppercase;
        color: var(--pharm-ink-soft); font-weight: 700;
        white-space: nowrap;
      }
      #pharm-hud .chip .v {
        font-size: 0.98rem; line-height: 1.1; font-weight: 700;
        letter-spacing: -0.01em; color: var(--pharm-ink);
        white-space: nowrap; display: flex; align-items: baseline; gap: 1px;
      }
      #pharm-hud .chip--cash .v { color: var(--pharm-olive); }
      #pharm-hud .chip--stack .v { color: var(--pharm-ochre-ink); }
      #pharm-hud .chip--staff .v { color: var(--pharm-denim); }
      #pharm-hud .chip--debt .v, #pharm-hud .chip--debt .k { color: var(--pharm-brick); }

      /* ---- objective: a painted plank, not a notification ---- */
      #pharm-objective {
        position: relative; align-self: center; max-width: 100%;
        display: flex; align-items: center; justify-content: center;
        background-color: var(--pharm-sign);
        background-image: var(--pharm-grain),
          repeating-linear-gradient(91deg, rgba(120, 78, 40, 0.11) 0 1px, transparent 1px 9px),
          repeating-linear-gradient(89deg, rgba(120, 78, 40, 0.06) 0 1px, transparent 1px 4px),
          linear-gradient(180deg, #f7e8c6 0%, #efdcb7 58%, #e3c99d 100%);
        background-size: 3px 3px, 5px 5px, auto, auto, 100% 100%;
        border: 1px solid var(--pharm-ink);
        border-radius: 2px 4px 3px 5px;
        padding: 8px 22px;
        color: var(--pharm-ink);
        font-family: var(--pharm-display);
        font-size: 0.68rem; line-height: 1.35;
        letter-spacing: 0.01em; text-transform: uppercase;
        white-space: nowrap;
        box-shadow: inset 0 0 0 3px var(--pharm-sign), inset 0 0 0 4px rgba(168, 74, 36, 0.32),
          inset 0 1px 0 rgba(255, 255, 255, 0.5), 0 2px 0 rgba(43, 33, 25, 0.34), 0 7px 16px rgba(40, 25, 12, 0.32);
        pointer-events: none; z-index: 1;
      }
      /* Two nail heads: the cheapest tell that this is a board, not a pill. */
      #pharm-objective::before, #pharm-objective::after {
        content: ''; position: absolute; top: 7px; width: 4px; height: 4px;
        border-radius: 50%;
        background: radial-gradient(circle at 35% 30%, #7b6a57, #2b2119 72%);
        box-shadow: 0 0 0 0.5px rgba(43, 33, 25, 0.55);
      }
      #pharm-objective::before { left: 8px; }
      #pharm-objective::after { right: 8px; }
      #pharm-objective span { overflow: hidden; text-overflow: ellipsis; min-width: 0; }
      #pharm-objective .hud-skip {
        flex: none; pointer-events: auto; margin-left: 10px;
        min-height: 28px; padding: 4px 8px;
        background: transparent;
        border: 1px solid var(--pharm-ink); border-radius: 2px;
        color: var(--pharm-ink);
        font-family: var(--pharm-body); font-size: 0.52rem; font-weight: 700;
        letter-spacing: 0.12em; text-transform: uppercase; line-height: 1;
        cursor: pointer;
      }
      #pharm-objective .hud-skip:hover { background: rgba(43, 33, 25, 0.08); }

      /* ---- toasts: paper slips with an accent rule ---- */
      #pharm-toasts {
        align-self: center; max-width: 100%;
        display: flex; flex-direction: column; gap: 6px; align-items: center;
        z-index: 13; pointer-events: none;
      }
      #pharm-toasts .toast {
        max-width: 100%;
        background-color: var(--pharm-paper);
        background-image: var(--pharm-grain);
        background-size: 3px 3px, 5px 5px;
        border: 1px solid var(--pharm-ink);
        border-left: 4px solid var(--pharm-olive);
        border-radius: 2px;
        color: var(--pharm-ink);
        padding: 6px 12px;
        font-size: 0.78rem; font-weight: 600; letter-spacing: 0.005em;
        box-shadow: var(--pharm-shadow);
        animation: pharm-toast-in 0.18s ease-out;
      }
      @keyframes pharm-toast-in { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }

      /* ---- bottom strip ---- */
      #pharm-hud .hint {
        position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%);
        background-color: var(--pharm-paper);
        background-image: var(--pharm-grain);
        background-size: 3px 3px, 5px 5px;
        border: 1px solid var(--pharm-ink); border-radius: 2px;
        padding: 5px 12px;
        color: var(--pharm-ink-soft);
        font-size: 0.72rem; font-weight: 600; letter-spacing: 0.015em;
        text-align: center; max-width: calc(100% - 260px);
        box-shadow: var(--pharm-shadow);
      }
      #pharm-invest-btn {
        position: absolute; right: 12px; bottom: 12px; z-index: 14; pointer-events: auto;
        min-height: 52px; min-width: 52px; padding: 0 18px;
        border: 1px solid var(--pharm-ink); border-radius: 3px;
        background: linear-gradient(180deg, #b5552c, var(--pharm-terracotta) 58%, var(--pharm-terracotta-deep));
        color: var(--pharm-cream);
        font-family: var(--pharm-body);
        font-weight: 700; font-size: 0.86rem; letter-spacing: 0.14em; text-transform: uppercase;
        text-shadow: 0 1px 0 rgba(43, 33, 25, 0.35);
        box-shadow: 0 2px 0 var(--pharm-ink), 0 8px 18px rgba(40, 25, 12, 0.4);
        cursor: pointer;
      }
      #pharm-invest-btn:hover { background: linear-gradient(180deg, #bd5c31, #af4d26 58%, var(--pharm-terracotta-deep)); }
      #pharm-invest-btn:active { transform: translateY(2px); box-shadow: 0 0 0 var(--pharm-ink), 0 4px 10px rgba(40, 25, 12, 0.35); }
      #pharm-invest-btn:focus-visible { outline: 2px solid var(--pharm-ochre); outline-offset: 2px; }
      #pharm-invest-btn .badge {
        display: block; margin-top: 2px;
        font-size: 0.56rem; font-weight: 600; letter-spacing: 0.06em;
        text-transform: none; opacity: 0.85;
      }
      /* Phones: the hint moves above the action row instead of sitting under INVEST,
         and the action button shrinks so the two never collide at 320-430px. */
      @media (max-width: 560px) {
        #pharm-hud .hint { left: 12px; right: 12px; bottom: 76px; transform: none; max-width: none; font-size: 0.66rem; padding: 4px 10px; }
        #pharm-invest-btn { padding: 0 12px; font-size: 0.78rem; }
        #pharm-invest-btn .badge { font-size: 0.54rem; max-width: 104px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        #pharm-debug { bottom: 132px; }
      }
      /* Narrow phones: six stats become a 3 x 2 ledger, equal cells, no ragged wrap. */
      @media (max-width: 430px) {
        #pharm-hud .topbar { width: 100%; flex-direction: column; gap: 0; padding: 3px 2px; }
        #pharm-hud .row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); }
        #pharm-hud .topbar .row + .row {
          border-left: none; border-top: 1px solid var(--pharm-ink-faint);
          margin: 0; padding: 0;
        }
        #pharm-hud .chip { padding: 5px 9px; }
        #pharm-hud .chip .v { font-size: 0.9rem; }
        #pharm-hud .chip .k { font-size: 0.52rem; letter-spacing: 0.13em; }
        #pharm-objective { font-size: 0.58rem; padding: 7px 12px; }
        #pharm-objective .hud-skip { font-size: 0.46rem; padding: 4px 5px; margin-left: 6px; }
      }

      /* ---- investment drawer: a paper ledger on cream stock ---- */
      #pharm-drawer {
        position: absolute; top: 0; right: 0; bottom: 0; width: min(360px, 92vw);
        background-color: var(--pharm-paper);
        background-image: var(--pharm-grain);
        background-size: 3px 3px, 5px 5px;
        border-left: 1px solid var(--pharm-ink);
        color: var(--pharm-ink);
        box-shadow: -10px 0 30px rgba(20, 12, 6, 0.45);
        z-index: 60; display: none; flex-direction: column; pointer-events: auto;
      }
      #pharm-drawer.open { display: flex; }
      #pharm-drawer header {
        display: flex; justify-content: space-between; align-items: center;
        padding: 10px 12px; border-bottom: 1px solid var(--pharm-ink);
        background: rgba(43, 33, 25, 0.05);
      }
      #pharm-drawer header h3 {
        margin: 0; font-family: var(--pharm-display);
        font-size: 0.78rem; letter-spacing: 0.04em; text-transform: uppercase;
        color: var(--pharm-ink);
      }
      #pharm-drawer .body { overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 10px; }
      #pharm-drawer .card {
        background-color: var(--pharm-paper-hi);
        background-image: var(--pharm-grain);
        background-size: 3px 3px, 5px 5px;
        border: 1px solid var(--pharm-ink); border-radius: 2px;
        padding: 9px 11px; box-shadow: var(--pharm-shadow);
      }
      #pharm-drawer .card h4 {
        margin: 0 0 6px; padding-bottom: 4px;
        border-bottom: 1px dashed rgba(43, 33, 25, 0.3);
        font-size: 0.66rem; font-weight: 700;
        text-transform: uppercase; letter-spacing: 0.14em;
        color: var(--pharm-ink-soft);
      }
      #pharm-drawer .item {
        display: flex; justify-content: space-between; gap: 8px; align-items: center;
        padding: 6px 0; border-bottom: 1px dashed rgba(43, 33, 25, 0.16);
      }
      #pharm-drawer .item:last-child { border-bottom: none; }
      #pharm-drawer .item .t { font-size: 0.8rem; font-weight: 700; color: var(--pharm-ink); letter-spacing: -0.005em; }
      #pharm-drawer .item .s { font-size: 0.68rem; color: var(--pharm-ink-soft); line-height: 1.35; }
      #pharm-drawer .item .s .owned-licence { color: var(--pharm-denim); font-weight: 600; }
      #pharm-drawer button.buy {
        min-height: 38px; padding: 6px 10px; border-radius: 2px;
        border: 1px solid var(--pharm-ink);
        font-family: var(--pharm-body); font-weight: 700; font-size: 0.7rem;
        letter-spacing: 0.04em;
        background: var(--pharm-terracotta); color: var(--pharm-cream);
        box-shadow: 0 1px 0 var(--pharm-ink);
        cursor: pointer; white-space: nowrap;
      }
      #pharm-drawer button.buy:active { transform: translateY(1px); box-shadow: none; }
      #pharm-drawer button.buy[disabled] {
        background: var(--pharm-paper-lo); color: #8a7a68;
        border: 1px dashed rgba(43, 33, 25, 0.35); box-shadow: none; cursor: not-allowed;
      }
      #pharm-drawer button.ghost {
        background: transparent; color: var(--pharm-ink);
        border: 1px solid var(--pharm-ink); box-shadow: none;
      }
      #pharm-drawer button.ghost:hover { background: rgba(43, 33, 25, 0.07); }
      #pharm-drawer button.hud-icon-btn {
        min-height: 34px; min-width: 34px; padding: 0; font-size: 1rem; letter-spacing: 0;
      }
      #pharm-drawer input[type=range] { width: 100%; accent-color: var(--pharm-terracotta); }

      /* ---- modals ---- */
      #pharm-modal-host {
        position: fixed; inset: 0; z-index: 70; display: none;
        align-items: center; justify-content: center;
        background: rgba(26, 17, 10, 0.74); backdrop-filter: blur(5px);
        pointer-events: auto; padding: 16px;
        font-family: var(--pharm-body); font-variant-numeric: tabular-nums;
      }
      #pharm-modal-host.open { display: flex; }
      #pharm-modal-host .modal {
        width: 100%; max-width: 440px;
        background-color: var(--pharm-paper);
        background-image: var(--pharm-grain);
        background-size: 3px 3px, 5px 5px;
        border: 1px solid var(--pharm-ink); border-radius: 3px;
        color: var(--pharm-ink); padding: 18px;
        box-shadow: 0 24px 60px rgba(20, 12, 6, 0.6), 0 2px 0 rgba(43, 33, 25, 0.35);
        max-height: 86vh; overflow-y: auto;
      }
      #pharm-modal-host .modal h2 {
        margin: 0 0 8px; padding-bottom: 6px;
        border-bottom: 1px solid rgba(43, 33, 25, 0.25);
        font-family: var(--pharm-display);
        font-size: 0.86rem; line-height: 1.4; letter-spacing: 0.02em;
        text-transform: uppercase; color: var(--pharm-ink);
      }
      #pharm-modal-host .modal p { font-size: 0.84rem; line-height: 1.5; color: #4a3b2c; margin: 0 0 12px; }
      #pharm-modal-host .modal .muted { color: var(--pharm-ink-soft); }
      #pharm-modal-host .modal .money-in { color: var(--pharm-olive); }
      #pharm-modal-host .modal .actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
      #pharm-modal-host .modal button {
        flex: 1; min-height: 46px; border-radius: 2px;
        border: 1px solid var(--pharm-ink);
        font-family: var(--pharm-body); font-weight: 700; font-size: 0.78rem;
        letter-spacing: 0.06em; text-transform: uppercase;
        cursor: pointer; background: var(--pharm-terracotta); color: var(--pharm-cream);
        box-shadow: 0 1px 0 var(--pharm-ink);
      }
      #pharm-modal-host .modal button:active { transform: translateY(1px); box-shadow: none; }
      #pharm-modal-host .modal button.secondary {
        background: transparent; color: var(--pharm-ink);
        border: 1px solid var(--pharm-ink); box-shadow: none; text-transform: none;
      }
      #pharm-modal-host .modal button[disabled] { opacity: 0.45; cursor: not-allowed; }
      #pharm-modal-host .inspection-list {
        background: var(--pharm-paper-hi);
        border: 1px solid var(--pharm-ink); border-radius: 2px;
        padding: 8px 10px;
      }
      #pharm-modal-host .inspection-list .item {
        display: flex; justify-content: space-between; gap: 8px; align-items: center;
        padding: 5px 0; border-bottom: 1px dashed rgba(43, 33, 25, 0.16);
      }
      #pharm-modal-host .inspection-list .item:last-child { border-bottom: none; }
      #pharm-modal-host .inspection-list .t { font-size: 0.78rem; font-weight: 700; }
      #pharm-modal-host .inspection-list .s { font-size: 0.66rem; color: var(--pharm-ink-soft); }
      #pharm-modal-host .insp-tag {
        display: inline-block; margin-right: 5px; padding: 1px 5px;
        border: 1px solid currentColor; border-radius: 1px;
        font-size: 0.5rem; font-weight: 700; letter-spacing: 0.12em;
        text-transform: uppercase; vertical-align: 1px;
      }
      #pharm-modal-host .insp-tag--pass { color: var(--pharm-olive); }
      #pharm-modal-host .insp-tag--warn { color: var(--pharm-ochre); }
      #pharm-modal-host .insp-tag--fail { color: var(--pharm-brick); }

      /* ---- dev overlay: inverted ink sheet, still warm ---- */
      #pharm-debug {
        position: absolute; left: 10px; bottom: 70px; z-index: 15;
        background: rgba(43, 33, 25, 0.94);
        border: 1px solid rgba(245, 233, 211, 0.28); border-radius: 2px;
        padding: 8px 10px; color: #d8c9a8;
        font-family: ui-monospace, Menlo, monospace;
        font-size: 0.62rem; line-height: 1.45;
        white-space: pre; display: none; pointer-events: auto;
        max-height: 52vh; overflow: auto;
      }
      #pharm-debug.open { display: block; }
`;

export class ArcadeStoreHud {
  public root: HTMLElement;
  public run: StoreRun;
  public telemetry: Telemetry;
  public onboarding: Onboarding;
  private cb: HudCallbacks;
  private debug: boolean;

  private bar!: HTMLElement;
  private cashEl!: HTMLElement;
  private dayEl!: HTMLElement;
  private debtEl!: HTMLElement;
  private trustEl!: HTMLElement;
  private staffEl!: HTMLElement;
  private stackEl!: HTMLElement;
  private objectiveEl!: HTMLElement;
  private toastWrap!: HTMLElement;
  private drawer!: HTMLElement;
  private drawerBody!: HTMLElement;
  private debugEl!: HTMLElement;
  private modalHost!: HTMLElement;
  private lastObjective = '';
  private lastKey = '';

  constructor(opts: HudOptions) {
    this.root = opts.root;
    this.run = opts.run;
    this.telemetry = opts.telemetry;
    this.onboarding = opts.onboarding;
    this.cb = opts.callbacks;
    this.debug = opts.debug;
    this.build();
  }

  // ------------------------------------------------------------------ build

  private build(): void {
    const style = document.createElement('style');
    style.id = 'pharm-hud-styles';
    style.textContent = hudCss();
    this.root.appendChild(style);

    const hud = document.createElement('div');
    hud.id = 'pharm-hud';
    hud.innerHTML = nairaToSvgMarkup(hudShellHtml());
    this.root.appendChild(hud);

    this.bar = hud;
    this.cashEl = hud.querySelector('#hud-cash')!;
    this.dayEl = hud.querySelector('#hud-day')!;
    this.debtEl = hud.querySelector('#hud-debt')!;
    this.trustEl = hud.querySelector('#hud-trust')!;
    this.staffEl = hud.querySelector('#hud-staff')!;
    this.stackEl = hud.querySelector('#hud-stack')!;
    this.objectiveEl = hud.querySelector('#pharm-objective')!;
    this.toastWrap = hud.querySelector('#pharm-toasts')!;
    this.drawer = hud.querySelector('#pharm-drawer')!;
    this.drawerBody = hud.querySelector('#pharm-drawer-body')!;
    this.debugEl = hud.querySelector('#pharm-debug')!;

    // Touch devices get touch copy: WASD is meaningless on a phone.
    const coarse = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
    const hintEl = hud.querySelector('#hud-hint');
    if (hintEl && coarse) {
      hintEl.textContent = 'Drag to move · hold still on a zone to act';
    }

    const modalHost = document.createElement('div');
    modalHost.id = 'pharm-modal-host';
    this.root.appendChild(modalHost);
    this.modalHost = modalHost;

    hud.querySelector('#pharm-invest-btn')!.addEventListener('click', () => this.toggleDrawer());
    hud.querySelector('#pharm-drawer-close')!.addEventListener('click', () => this.toggleDrawer(false));
  }

  // ------------------------------------------------------------------ frame

  public update(ctx: HudContext): void {
    const key = [
      Math.round(this.run.cash),
      this.run.day,
      Math.round(this.run.debt),
      Math.round(this.run.trust),
      ctx.stackCount,
      ctx.stackCapacity,
    ].join('|');
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.cashEl.innerHTML = nairaToSvgMarkup(compact(this.run.cash));
      this.cashEl.title = nairaPlainText(money(this.run.cash));
      this.dayEl.textContent = `${Math.min(this.run.day, 90)} / 90`;
      this.debtEl.innerHTML = nairaToSvgMarkup(compact(this.run.debt));
      this.debtEl.title = nairaPlainText(money(this.run.debt));
      this.trustEl.textContent = String(Math.round(this.run.trust));
      this.stackEl.textContent = `${ctx.stackCount} / ${ctx.stackCapacity}`;
      const staffCount = (Object.keys(EMPLOYEES) as EmployeeRole[]).reduce(
        (sum, role) => sum + this.run.state.employees[role].count,
        0
      );
      this.staffEl.textContent = String(staffCount);
      this.updateInvestBadge();
    }

    const objective = this.objectiveFor(ctx);
    if (objective !== this.lastObjective) {
      this.lastObjective = objective;
      const tutorial = !this.onboarding.isComplete;
      setNairaHtml(
        this.objectiveEl,
        tutorial
          ? `<span>${objective}</span> <button id="pharm-skip-tutorial" class="hud-skip">LET ME PLAY</button>`
          : `<span>${objective}</span>`
      );
      this.objectiveEl.querySelector('#pharm-skip-tutorial')?.addEventListener('click', () => {
        this.onboarding.skip();
        this.cb.onSkipTutorial?.();
        this.lastObjective = '';
      });
    }

    if (this.debug && this.debugEl.classList.contains('open')) this.renderDebug();
  }

  private objectiveFor(ctx: HudContext): string {
    const step = this.onboarding.current();
    if (step) return step.banner;
    const next = this.run.nextLicenseTier();
    return nextObjective({
      carried: ctx.stackCount,
      shelfStock: ctx.shelfStock,
      shelfCapacity: this.run.shelfCapacity,
      queue: ctx.queueLength,
      cashOnFloor: ctx.cashOnFloor,
      affordableUpgrade: this.run.cash > this.run.upgradeCost('carry'),
      nextLicenseCost: next ? next.cost : null,
      cash: this.run.cash,
      rushActive: this.run.state.rushActive,
    });
  }

  private updateInvestBadge(): void {
    const hint = this.bar.querySelector('#hud-invest-hint') as HTMLElement | null;
    if (!hint) return;
    const next = this.run.nextLicenseTier();
    // Phones get the price only: the full "buy: <name>" string does not fit a
    // 320px row next to the INVEST label and ends up ellipsised mid-word.
    const narrow = typeof window !== 'undefined' && window.innerWidth <= 560;
    if (next && this.run.cash >= next.cost) {
      setNairaText(hint, narrow ? `₦${(next.cost / 1000).toFixed(0)}k licence` : `buy: ${next.name}`);
    } else if (this.run.cash >= this.run.upgradeCost('carry')) {
      hint.textContent = narrow ? 'upgrade ready' : 'upgrades ready';
    } else {
      hint.textContent = narrow ? 'licences · staff' : 'licences · staff · upgrades';
    }
  }

  // ------------------------------------------------------------------ drawer

  public toggleDrawer(force?: boolean): void {
    const open = force ?? !this.drawer.classList.contains('open');
    this.drawer.classList.toggle('open', open);
    if (open) this.renderDrawer();
  }

  private renderDrawer(): void {
    setNairaHtml(this.drawerBody, drawerHtml(this.run));

    this.drawerBody.querySelectorAll('[data-buy]').forEach((el) => {
      el.addEventListener('click', () => this.handleBuy((el as HTMLElement).dataset.buy!));
    });

    const slider = this.drawerBody.querySelector('#debt-share') as HTMLInputElement | null;
    slider?.addEventListener('input', () => {
      const pct = Number(slider.value);
      this.run.setDebtServiceShare(pct / 100);
      const label = this.drawerBody.querySelector('#debt-share-label');
      if (label) label.textContent = `${pct}%`;
    });

    this.drawerBody.querySelector('#hud-save')?.addEventListener('click', () => {
      this.cb.onSave();
      this.toast('Progress saved.', '#55643a');
    });
    this.drawerBody.querySelector('#hud-export')?.addEventListener('click', () => {
      downloadFunnel(this.telemetry);
      this.toast('Funnel exported as JSON.', '#4f6577');
    });
    this.drawerBody.querySelector('#hud-new')?.addEventListener('click', () => this.confirmNewGame());
  }

  private handleBuy(key: string): void {
    const [kind, arg] = key.split(':');
    let result: { ok: boolean; reason?: string } = { ok: false };
    let message = '';

    if (kind === 'upgrade') {
      const id = arg as UpgradeId;
      result = this.run.buyUpgrade(id);
      message = result.ok ? `${UPGRADES[id].name} upgraded.` : 'Not enough cash for that upgrade.';
      if (result.ok) this.cb.onPurchase('upgrade');
    } else if (kind === 'license') {
      const next = this.run.nextLicenseTier();
      if (next) {
        result = this.run.buyLicense(next.tier);
        message = result.ok ? `${next.name} unlocked — new stock and more walk-ins.` : 'The licence desk wants cash first.';
        if (result.ok) this.cb.onPurchase('license');
      }
    } else if (kind === 'staff') {
      const role = arg as EmployeeRole;
      result = this.run.hire(role);
      message = result.ok ? `${EMPLOYEES[role].name} hired — ${money(EMPLOYEES[role].dailyWage)}/day.` : 'Wages are paid upfront.';
      if (result.ok) this.cb.onPurchase('staff');
    } else if (kind === 'expansion') {
      result = this.run.expand();
      message = result.ok ? 'Floor expanded. New aisles, more stock, more walk-ins.' : 'Not enough cash to knock down that wall.';
      if (result.ok) this.cb.onPurchase('expansion');
    } else if (kind === 'debt') {
      const paid = this.run.payDebt(Math.min(this.run.cash, this.run.debt));
      result = { ok: paid > 0 };
      message = paid > 0 ? `Paid ${money(paid)} to Chief Okonkwo.` : 'Nothing to pay with.';
      if (paid > 0) this.cb.onPurchase('debt');
    }

    this.toast(message, result.ok ? '#55643a' : '#9a3b2a');
    this.renderDrawer();
    if (result.ok) this.cb.onSave();
  }

  private confirmNewGame(): void {
    this.openModal(`
      <h2>Start a new season?</h2>
      <p>This wipes the current save: cash, licences, staff and the debt clock all reset to day 1.</p>
      <div class="actions">
        <button class="secondary" id="modal-cancel">Keep playing</button>
        <button id="modal-confirm">Wipe & restart</button>
      </div>
    `);
    this.modalHost.querySelector('#modal-cancel')?.addEventListener('click', () => this.closeModal());
    this.modalHost.querySelector('#modal-confirm')?.addEventListener('click', () => {
      this.closeModal();
      this.cb.onNewGame();
    });
  }

  // ------------------------------------------------------------------ modals

  private openModal(html: string): void {
    setNairaHtml(this.modalHost, `<div class="modal">${html}</div>`);
    this.modalHost.classList.add('open');
  }

  public closeModal(): void {
    this.modalHost.classList.remove('open');
    this.modalHost.innerHTML = '';
  }

  public get modalOpen(): boolean {
    return this.modalHost.classList.contains('open');
  }

  public showOffline(result: OfflineResult): void {
    const body =
      result.earned > 0
        ? `<p>You were away for <b>${formatDuration(result.seconds)}</b>${result.capped ? ' (the shop can hold 8h of trade)' : ''}.
             Your staff worked <b>${result.days} shift${result.days === 1 ? '' : 's'}</b>, served <b>${result.served}</b> customers and banked <b class="money-in">${money(result.earned)}</b>.</p>`
        : `<p>You were away for <b>${formatDuration(result.seconds)}</b>. Nothing was banked — a store with no cashier and stocker cannot trade while you sleep. Hire staff first.</p>`;
    this.openModal(`
      <h2>While you were away</h2>
      ${body}
      <div class="actions"><button id="modal-ok">Open the shutters</button></div>
    `);
    this.modalHost.querySelector('#modal-ok')?.addEventListener('click', () => this.closeModal());
  }

  /** Day 90: the last decision of the season belongs to the player. */
  public showEndingChoice(run: StoreRun, onDecision: (decision: 'stay' | 'leave') => void): void {
    this.openModal(`
      <h2>Day 90 — the flight is tonight</h2>
      <p>Chief Okonkwo's balance stands at <b>${money(run.debt)}</b> with <b>${money(run.cash)}</b> in the till.
      The Heathrow boarding pass is on the counter next to the poison register.</p>
      <p>Stay and fight for Auntie Joke's shop, or board the flight and hand the keys to Sade?</p>
      <div class="actions">
        <button class="secondary" id="modal-stay">Stay in Orile-Koka</button>
        <button id="modal-leave">Board the flight</button>
      </div>
    `);
    this.modalHost.querySelector('#modal-stay')?.addEventListener('click', () => {
      this.closeModal();
      onDecision('stay');
    });
    this.modalHost.querySelector('#modal-leave')?.addEventListener('click', () => {
      this.closeModal();
      onDecision('leave');
    });
  }

  public showEndgame(report: EndgameReport): void {
    const decisions = report.playerDecision;
    this.openModal(`
      <h2>${report.headline}</h2>
      <p style="font-style:italic">${report.subheadline}</p>
      <p>${report.narrativeText}</p>
      <p class="muted">Sade: “${report.sadeFinalQuote}”</p>
      <p><b>Debt repaid:</b> ${money(report.debtRepaid)} of ${money(report.originalDebt)}<br/>
         <b>Cash:</b> ${money(report.finalCash)} · <b>Trust:</b> ${Math.round(report.trust)} ${report.trustBadge}<br/>
         <b>Customers served:</b> ${report.customersServed} · <b>Clues:</b> ${report.cluesCount}</p>
      <div class="actions">
        <button class="secondary" id="modal-stay" ${decisions === 'stay' ? 'disabled' : ''}>Stay in Orile-Koka</button>
        <button id="modal-leave" ${decisions === 'leave' ? 'disabled' : ''}>Board the flight</button>
      </div>
      <div class="actions"><button class="secondary" id="modal-restart">New 90-day season</button></div>
    `);
    this.modalHost.querySelector('#modal-stay')?.addEventListener('click', () => this.cb.onEnding('stay'));
    this.modalHost.querySelector('#modal-leave')?.addEventListener('click', () => this.cb.onEnding('leave'));
    this.modalHost.querySelector('#modal-restart')?.addEventListener('click', () => this.cb.onNewGame());
  }

  public showInspection(result: {
    passed: boolean;
    defectType: string;
    fine: number;
    inspectorDialogue: string;
    areas: Array<{ name: string; status: string; detail: string }>;
    sealed: boolean;
  }): void {
    const tag = (status: string): string =>
      status === 'pass'
        ? '<span class="insp-tag insp-tag--pass">pass</span>'
        : status === 'minor_defect'
          ? '<span class="insp-tag insp-tag--warn">minor</span>'
          : '<span class="insp-tag insp-tag--fail">fail</span>';
    const rows = result.areas
      .map(
        (a) =>
          `<div class="item"><div><div class="t">${tag(a.status)}${a.name}</div>
           <div class="s">${a.detail}</div></div></div>`
      )
      .join('');
    this.openModal(`
      <h2>Pharmacy Board inspection</h2>
      <p style="font-style:italic">“${result.inspectorDialogue}”</p>
      <div class="inspection-list">${rows}</div>
      <p style="margin-top:10px">${result.sealed ? 'The premises are sealed. That is two strikes.' : result.fine > 0 ? `Fine: ${money(result.fine)} deducted from the till.` : 'No fine. The file is clean.'}</p>
      <div class="actions"><button id="modal-ok">Continue</button></div>
    `);
    this.modalHost.querySelector('#modal-ok')?.addEventListener('click', () => this.closeModal());
  }

  public showCounterfeit(crate: { productId: string; unitCost: number }, onDecide: (accept: boolean) => void): void {
    this.openModal(`
      <h2>Dele's courier is at the door</h2>
      <p>“Bros, 40% off, cash only, no invoice. Same batch as before. Take am quick before the others hear.”</p>
      <p>The box is <b>${money(crate.unitCost)}</b> per unit instead of market price. The seal looks re-glued and the scratch panel is already scratched.</p>
      <div class="actions">
        <button class="secondary" id="modal-refuse">Refuse & log the clue</button>
        <button id="modal-accept">Take the discount</button>
      </div>
    `);
    this.modalHost.querySelector('#modal-refuse')?.addEventListener('click', () => {
      this.closeModal();
      onDecide(false);
    });
    this.modalHost.querySelector('#modal-accept')?.addEventListener('click', () => {
      this.closeModal();
      onDecide(true);
    });
  }

  // ------------------------------------------------------------------ misc

  public toast(text: string, color = '#55643a'): void {
    const el = document.createElement('div');
    el.className = 'toast';
    setNairaText(el, text);
    el.style.borderLeftColor = color;
    this.toastWrap.appendChild(el);
    setTimeout(() => el.remove(), 3200);
    while (this.toastWrap.children.length > 3) this.toastWrap.firstElementChild?.remove();
  }

  public setOnboardingStep(step: number): void {
    this.onboarding = new Onboarding(step);
  }

  public get onboardingComplete(): boolean {
    return this.onboarding.currentStep >= ONBOARDING_DONE;
  }

  public toggleDebug(): void {
    this.debugEl.classList.toggle('open');
    if (this.debugEl.classList.contains('open')) this.renderDebug();
  }

  public renderDebug(): void {
    const report: FunnelReport = this.telemetry.funnel();
    const r = this.run;
    const lines = [
      `day ${r.day}/90  cash ${money(r.cash)}  debt ${money(r.debt)}`,
      `tier ${r.highestTier}  exp ${r.state.expansions}  staff ${(Object.keys(EMPLOYEES) as EmployeeRole[]).reduce((s, k) => s + r.state.employees[k].count, 0)}`,
      `quota ${r.dailyQuota}  servedToday ${r.servedToday}  queue ${r.queue.length}`,
      `shelf ${JSON.stringify(r.shelfLevels)}`,
      `stats sold ${r.stats.customersServed} lost ${r.stats.customersLost} rev ${money(r.stats.revenue)} cogs ${money(r.stats.cogs)}`,
      '--- funnel ---',
      ...this.telemetry.debugLines(),
      `drop-off ${report.dropOff}  median day ${report.medianDayReached}`,
    ];
    setNairaText(this.debugEl, lines.join('\n'));
  }

  public pulseObjective(): void {
    this.objectiveEl.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.05)' }, { transform: 'scale(1)' }],
      { duration: 320, easing: 'ease-out' }
    );
  }

  public destroy(): void {
    this.bar.remove();
    this.modalHost.remove();
  }
}
