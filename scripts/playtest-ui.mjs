import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const errors = [];
const context = await browser.newContext({ viewport: { width: 414, height: 896 } });
const page = await context.newPage();
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

const state = () => page.evaluate(() => window.pharmChris.state());

await page.goto('http://127.0.0.1:4173/?mode=arcade&debug=1', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

// 1. UI purchase: licence via the drawer
await page.click('#pharm-invest-btn');
await page.waitForTimeout(250);
const beforeLicence = await state();
await page.click('#pharm-drawer [data-buy="license"]');
await page.waitForTimeout(250);
const afterLicence = await state();

// 2. UI hire: stocker
await page.click('#pharm-drawer [data-buy="staff:stocker"]');
await page.waitForTimeout(250);
const afterHire = await state();

// 3. UI upgrade: carry
const cashBeforeUpgrade = (await state()).cash;
await page.click('#pharm-drawer [data-buy="upgrade:carry"]');
await page.waitForTimeout(250);
const afterUpgrade = await state();

// 4. Debt slider
await page.evaluate(() => {
  const s = document.querySelector('#debt-share');
  s.value = '80';
  s.dispatchEvent(new Event('input', { bubbles: true }));
});
const share = await page.evaluate(() => window.pharmChris.run.debtServiceShare);
await page.click('#pharm-drawer-close');

// 5. Offline: fresh context primed with a save from 6 hours ago
const snapshot = await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem('pharm_chris_run_v2'));
  raw.savedAt = Date.now() - 6 * 3600 * 1000;
  raw.data.lastSeenAt = raw.savedAt;
  raw.data.employees.cashier.count = 1;
  raw.data.licenses = [1, 2];
  raw.data.shelves = { analgesic: 20, antimalarial: 20, antibiotic: 12, cold_chain: 0 };
  raw.data.cash = 600000;
  return raw;
});
await context.close();

const offlineContext = await browser.newContext({ viewport: { width: 414, height: 896 } });
await offlineContext.addInitScript((payload) => {
  try {
    localStorage.setItem('pharm_chris_run_v2', payload);
  } catch {
    /* ignore */
  }
}, JSON.stringify(snapshot));
const offlinePage = await offlineContext.newPage();
offlinePage.on('pageerror', (e) => errors.push(`offline pageerror: ${e.message}`));
await offlinePage.goto('http://127.0.0.1:4173/?mode=arcade&debug=1', { waitUntil: 'networkidle' });
await offlinePage.waitForTimeout(3000);
const offlineModal = await offlinePage.evaluate(
  () => document.querySelector('#pharm-modal-host')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 240) ?? ''
);
const offlineCash = await offlinePage.evaluate(() => window.pharmChris.state().cash);
await offlinePage.screenshot({ path: 'C:/Users/hp/AppData/Local/hermes/cache/scratch/pharmchris/g7-offline.png' });
await offlinePage.click('#modal-ok').catch(() => {});
await offlinePage.waitForTimeout(300);

// 6. Debug overlay
await offlinePage.keyboard.press('F2');
await offlinePage.waitForTimeout(300);
const debugText = await offlinePage.evaluate(() => document.querySelector('#pharm-debug')?.textContent ?? '');
await offlinePage.screenshot({ path: 'C:/Users/hp/AppData/Local/hermes/cache/scratch/pharmchris/g8-debug.png' });
const funnel = await offlinePage.evaluate(() => window.pharmChris.funnel());

console.log(JSON.stringify({
  errors,
  licence: { tierBefore: beforeLicence.tier, tierAfter: afterLicence.tier, cashBefore: beforeLicence.cash, cashAfter: afterLicence.cash },
  hireCount: afterHire.staff.stocker.count,
  carryUpgrade: { cashBefore: cashBeforeUpgrade, cashAfter: afterUpgrade.cash },
  debtShare: share,
  offline: { savedCash: snapshot.data.cash, modal: offlineModal, cashAfter: offlineCash },
  debugOverlay: debugText.slice(0, 320),
  funnel: funnel.funnel.map((f) => `${f.step}:${f.count}`),
}, null, 2));
await browser.close();
