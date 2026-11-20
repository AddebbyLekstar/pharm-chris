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
      <div class="topbar">
        <div class="row">
          <div class="chip"><div class="k">Cash</div><div class="v" id="hud-cash" style="color:#00E676">₦0</div></div>
          <div class="chip"><div class="k">Day</div><div class="v" id="hud-day">1 / 90</div></div>
          <div class="chip"><div class="k">Stack</div><div class="v" id="hud-stack" style="color:#ffd54f">0 / 5</div></div>
        </div>
        <div class="row">
          <div class="chip"><div class="k">Trust</div><div class="v" id="hud-trust">50</div></div>
          <div class="chip"><div class="k">Staff</div><div class="v" id="hud-staff" style="color:#8fd6ff">0</div></div>
          <div class="chip" style="border-color:#6b2c2c"><div class="k" style="color:#e5a1a1">Debt</div><div class="v" id="hud-debt" style="color:#ff6b6b">₦0</div></div>
        </div>
      </div>
      <div id="pharm-objective">📦 WALK TO THE DOCK</div>
      <div id="pharm-toasts"></div>
      <div class="hint"><span id="hud-hint">WASD / drag to move — hold still on a zone to act</span></div>
      <button id="pharm-invest-btn">INVEST<span class="badge" id="hud-invest-hint">licences · staff · upgrades</span></button>
      <div id="pharm-drawer">
        <header><h3>Store Investment</h3><button class="buy ghost" id="pharm-drawer-close" style="min-height:32px">✕</button></header>
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
    .map((t) => `<span style="font-size:0.68rem;color:#8fd6ff">${t.name}</span>`)
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
    style.textContent = `
      #pharm-hud { position:absolute; inset:0; pointer-events:none; z-index:10; font-family: system-ui,-apple-system,sans-serif; }
      #pharm-hud .chip { background: rgba(14,22,18,0.9); border:1.5px solid #26362d; border-radius:12px; padding:6px 10px; box-shadow:0 4px 12px rgba(0,0,0,0.45); }
      #pharm-hud .chip .k { font-size:0.6rem; letter-spacing:0.08em; text-transform:uppercase; color:#93a89d; font-weight:700; }
      #pharm-hud .chip .v { font-size:1rem; font-weight:900; line-height:1.15; color:#fff; }
      #pharm-hud .row { display:flex; gap:6px; align-items:center; flex-wrap:wrap; }
      #pharm-hud .topbar { position:absolute; top:10px; left:10px; right:10px; display:flex; justify-content:space-between; gap:8px; pointer-events:auto; z-index:12; }
      #pharm-objective { position:absolute; top:78px; left:50%; transform:translateX(-50%); display:flex; align-items:center; gap:8px; background:linear-gradient(135deg,rgba(16,26,21,0.95),rgba(9,16,12,0.97)); border:2px solid #00E676; border-radius:20px; padding:6px 14px; color:#fff; font-size:0.8rem; font-weight:800; letter-spacing:0.03em; white-space:nowrap; max-width:92vw; z-index:12; pointer-events:none; }
      #pharm-objective span { overflow:hidden; text-overflow:ellipsis; }
      @media (max-width: 430px) {
        #pharm-hud .chip { padding:5px 9px; border-radius:10px; }
        #pharm-hud .chip .v { font-size:0.9rem; }
        #pharm-hud .chip .k { font-size:0.55rem; }
        #pharm-objective { top:112px; font-size:0.7rem; padding:5px 10px; max-width:94vw; }
        #pharm-toasts { top:148px; }
      }
      #pharm-hud .hint { position:absolute; bottom:12px; left:50%; transform:translateX(-50%); background:rgba(10,16,13,0.78); border:1px solid rgba(255,255,255,0.1); border-radius:20px; padding:5px 14px; color:#c4d4cc; font-size:0.74rem; text-align:center; max-width:calc(100% - 240px); }
      #pharm-invest-btn { position:absolute; right:12px; bottom:12px; z-index:14; pointer-events:auto; min-height:52px; min-width:52px; padding:0 18px; border-radius:16px; background:linear-gradient(160deg,#00E676,#00b45e); color:#04160d; font-weight:900; font-size:0.9rem; border:none; box-shadow:0 8px 22px rgba(0,230,118,0.35); cursor:pointer; letter-spacing:0.04em; }
      #pharm-invest-btn .badge { display:block; font-size:0.6rem; font-weight:700; opacity:0.8; }
      /* Phones: the hint moves above the action row instead of sitting under INVEST,
         and the action button shrinks so the two never collide at 320-430px. */
      @media (max-width: 560px) {
        #pharm-hud .hint { left:12px; right:12px; bottom:76px; transform:none; max-width:none; font-size:0.66rem; padding:4px 10px; }
        #pharm-invest-btn { padding:0 12px; font-size:0.8rem; }
        #pharm-invest-btn .badge { font-size:0.54rem; max-width:104px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        #pharm-debug { bottom:120px; }
      }
      #pharm-toasts { position:absolute; top:118px; left:50%; transform:translateX(-50%); display:flex; flex-direction:column; gap:6px; align-items:center; z-index:13; pointer-events:none; }
      #pharm-toasts .toast { background:rgba(12,20,16,0.95); border:1px solid #2f4638; border-left:4px solid #00E676; color:#eaf3ee; padding:7px 13px; border-radius:9px; font-size:0.8rem; font-weight:600; box-shadow:0 6px 18px rgba(0,0,0,0.5); animation: pharm-toast-in 0.18s ease-out; }
      @keyframes pharm-toast-in { from { opacity:0; transform:translateY(-6px);} to {opacity:1; transform:none;} }
      #pharm-drawer { position:absolute; top:0; right:0; bottom:0; width:min(360px,92vw); background:#0d1512; border-left:2px solid #1f332a; color:#e8f2ec; z-index:60; display:none; flex-direction:column; pointer-events:auto; }
      #pharm-drawer.open { display:flex; }
      #pharm-drawer header { display:flex; justify-content:space-between; align-items:center; padding:12px 14px; border-bottom:1px solid #1f332a; }
      #pharm-drawer header h3 { margin:0; font-size:0.95rem; letter-spacing:0.06em; text-transform:uppercase; color:#00E676; }
      #pharm-drawer .body { overflow-y:auto; padding:12px; display:flex; flex-direction:column; gap:10px; }
      #pharm-drawer .card { background:#121d18; border:1px solid #22362c; border-radius:12px; padding:10px 12px; }
      #pharm-drawer .card h4 { margin:0 0 6px; font-size:0.78rem; text-transform:uppercase; letter-spacing:0.07em; color:#9db3a7; }
      #pharm-drawer .item { display:flex; justify-content:space-between; gap:8px; align-items:center; padding:6px 0; border-bottom:1px dashed rgba(255,255,255,0.06); }
      #pharm-drawer .item:last-child { border-bottom:none; }
      #pharm-drawer .item .t { font-size:0.8rem; font-weight:700; color:#eef6f1; }
      #pharm-drawer .item .s { font-size:0.68rem; color:#8fa79b; }
      #pharm-drawer button.buy { min-height:38px; padding:6px 10px; border-radius:9px; border:none; font-weight:800; font-size:0.72rem; background:#00E676; color:#04160d; cursor:pointer; white-space:nowrap; }
      #pharm-drawer button.buy[disabled] { background:#24352c; color:#6f8478; cursor:not-allowed; }
      #pharm-drawer button.ghost { background:#1a2822; color:#cfe3d8; border:1px solid #2b4237; }
      #pharm-drawer input[type=range] { width:100%; accent-color:#00E676; }
      #pharm-modal-host { position:fixed; inset:0; z-index:70; display:none; align-items:center; justify-content:center; background:rgba(6,10,8,0.82); backdrop-filter:blur(5px); pointer-events:auto; padding:16px; }
      #pharm-modal-host.open { display:flex; }
      #pharm-modal-host .modal { width:100%; max-width:440px; background:#111c17; border:2px solid #00E676; border-radius:16px; color:#eaf3ee; padding:18px; box-shadow:0 24px 60px rgba(0,0,0,0.6); max-height:86vh; overflow-y:auto; }
      #pharm-modal-host .modal h2 { margin:0 0 6px; font-size:1.05rem; color:#00E676; }
      #pharm-modal-host .modal p { font-size:0.84rem; line-height:1.45; color:#cfe0d7; margin:0 0 12px; }
      #pharm-modal-host .modal .actions { display:flex; gap:8px; flex-wrap:wrap; margin-top:12px; }
      #pharm-modal-host .modal button { flex:1; min-height:46px; border-radius:10px; border:none; font-weight:800; font-size:0.82rem; cursor:pointer; background:#00E676; color:#04160d; }
      #pharm-modal-host .modal button.secondary { background:#1e2f27; color:#cfe0d7; border:1px solid #2f4a3b; }
      #pharm-debug { position:absolute; left:10px; bottom:70px; z-index:15; background:rgba(4,8,6,0.92); border:1px solid #24402f; border-radius:10px; padding:8px 10px; color:#9ef7c4; font-family:ui-monospace,Menlo,monospace; font-size:0.62rem; line-height:1.4; white-space:pre; display:none; pointer-events:auto; max-height:52vh; overflow:auto; }
      #pharm-debug.open { display:block; }
    `;
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
          ? `<span>${objective}</span> <button id="pharm-skip-tutorial" style="pointer-events:auto;margin-left:10px;background:#1e2f27;border:1px solid #2f4a3b;color:#cfe0d7;border-radius:9px;font-size:0.62rem;font-weight:800;padding:4px 8px;cursor:pointer;">LET ME PLAY</button>`
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
      this.toast('Progress saved.', '#00E676');
    });
    this.drawerBody.querySelector('#hud-export')?.addEventListener('click', () => {
      downloadFunnel(this.telemetry);
      this.toast('Funnel exported as JSON.', '#8fd6ff');
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

    this.toast(message, result.ok ? '#00E676' : '#ff8a80');
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
             Your staff worked <b>${result.days} shift${result.days === 1 ? '' : 's'}</b>, served <b>${result.served}</b> customers and banked <b style="color:#00E676">${money(result.earned)}</b>.</p>`
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
      <p style="color:#9db3a7">Sade: “${report.sadeFinalQuote}”</p>
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
    const rows = result.areas
      .map(
        (a) =>
          `<div class="item"><div><div class="t">${a.status === 'pass' ? '✅' : a.status === 'minor_defect' ? '⚠️' : '⛔'} ${a.name}</div>
           <div class="s">${a.detail}</div></div></div>`
      )
      .join('');
    this.openModal(`
      <h2>Pharmacy Board inspection</h2>
      <p style="font-style:italic">“${result.inspectorDialogue}”</p>
      <div class="card" style="background:#121d18;border:1px solid #22362c;border-radius:10px;padding:8px">${rows}</div>
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

  public toast(text: string, color = '#00E676'): void {
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
      [{ transform: 'translateX(-50%) scale(1)' }, { transform: 'translateX(-50%) scale(1.06)' }, { transform: 'translateX(-50%) scale(1)' }],
      { duration: 320, easing: 'ease-out' }
    );
  }

  public destroy(): void {
    this.bar.remove();
    this.modalHost.remove();
  }
}
