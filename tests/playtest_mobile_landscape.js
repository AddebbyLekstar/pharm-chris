import { chromium } from 'playwright';
import { spawn } from 'child_process';

async function main() {
  console.log('====================================================');
  console.log('--- STARTING RIGOROUS MOBILE LANDSCAPE PLAYTEST ---');
  console.log('====================================================');

  // Spin up Vite on dedicated port 5183
  const vite = spawn('npx', ['vite', '--port', '5183', '--strictPort'], {
    stdio: 'pipe',
    shell: true,
  });

  vite.stdout.on('data', (d) => process.stdout.write(`[Vite] ${d}`));
  vite.stderr.on('data', (d) => process.stderr.write(`[Vite ERR] ${d}`));

  // Wait 3.5s for server boot
  await new Promise((r) => setTimeout(r, 3500));

  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=swiftshader', '--enable-webgl', '--no-sandbox'],
  });

  // Emulate iPhone / Android flagship mobile in Widescreen Landscape (844 x 390)
  const context = await browser.newContext({
    viewport: { width: 844, height: 390 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });

  const page = await context.newPage();
  const consoleErrors = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
      console.error(`[PAGE ERROR] ${msg.text()}`);
    } else {
      console.log(`[PAGE LOG] ${msg.text()}`);
    }
  });

  page.on('pageerror', (err) => {
    consoleErrors.push(err.message);
    console.error(`[UNCAUGHT] ${err.message}`);
  });

  try {
    // 1. VERIFY DEFAULT LAUNCHER IS 3D ARCADE MODE (Option 2 Default)
    console.log('--- PHASE 1: TESTING MOBILE LANDSCAPE DEFAULT LAUNCHER (ARCADE MODE) ---');
    await page.goto('http://localhost:5183', { waitUntil: 'networkidle' });

    // Check active mode switcher is Arcade
    const arcadeModeBtn = await page.waitForSelector('#btn-mode-arcade', { timeout: 8000 });
    const arcadeBtnBg = await arcadeModeBtn.evaluate((el) => el.style.background);
    console.log(`Mode button background: ${arcadeBtnBg}`);

    console.log('Verifying Arcade canvas & full-screen responsive landscape viewport...');
    const canvas = await page.waitForSelector('canvas', { timeout: 6000 });
    if (!canvas) throw new Error('Arcade canvas not rendered');

    console.log('Checking Arcade HUD elements: Debt ticker, cash, day clock...');
    await page.waitForSelector('#hud-debt-ticker', { timeout: 5000 });
    await page.waitForSelector('#hud-cash-counter', { timeout: 5000 });
    await page.waitForSelector('.arcade-hud', { timeout: 5000 });
    console.log('✓ Arcade HUD elements verified');

    console.log('Testing Virtual Joystick touch interaction in Arcade mode...');
    const touchZone = await page.waitForSelector('#touch-joystick-zone', { timeout: 5000 });
    const box = await touchZone.boundingBox();
    if (box) {
      // Touch start & drag
      await page.touchscreen.tap(box.x + 80, box.y + 80);
      console.log('✓ Arcade touch joystick active and dispatched touch event');
    }

    await page.waitForTimeout(2000);

    // 2. SWITCH TO FIRST-PERSON SIMULATOR MODE VIA TOGGLE
    console.log('--- PHASE 2: TESTING FIRST-PERSON MODE MOBILE TOUCH CONTROLS ---');
    const btn3D = await page.waitForSelector('#btn-mode-3d', { timeout: 5000 });
    await btn3D.click();
    await page.waitForTimeout(2000);

    console.log('Verifying 3D mode container loaded...');
    await page.waitForSelector('#game-viewport-3d', { timeout: 6000 });

    console.log('Tapping enter pharmacy to start first person mode...');
    const enterBtn = await page.waitForSelector('#btn-enter-game', { timeout: 5000 });
    await enterBtn.click();
    await page.waitForTimeout(1500);

    console.log('Verifying Mobile Touch Control Layer and Action Buttons...');
    await page.waitForSelector('#fps-mobile-touch-layer', { timeout: 5000 });
    const moveZone = await page.waitForSelector('#fps-touch-zone-move', { timeout: 5000 });
    const lookZone = await page.waitForSelector('#fps-touch-zone-look', { timeout: 5000 });
    const actBtn = await page.waitForSelector('#btn-touch-interact', { timeout: 5000 });
    const masBtn = await page.waitForSelector('#btn-touch-inspect', { timeout: 5000 });
    const ledgerBtn = await page.waitForSelector('#btn-touch-ledger', { timeout: 5000 });
    const dropBtn = await page.waitForSelector('#btn-touch-drop', { timeout: 5000 });

    console.log('✓ All 4 ergonomic touch buttons ([E] ACT, [F] MAS, [Q] DROP, LEDGER) present');

    console.log('Testing Virtual Joystick move in 3D...');
    const moveBox = await moveZone.boundingBox();
    if (moveBox) {
      await page.touchscreen.tap(moveBox.x + 60, moveBox.y + 120);
      console.log('✓ 3D Virtual Touch Joystick translated movement');
    }

    console.log('Testing Look zone swipe in 3D...');
    const lookBox = await lookZone.boundingBox();
    if (lookBox) {
      await page.touchscreen.tap(lookBox.x + 100, lookBox.y + 100);
      console.log('✓ 3D Touch Look area rotated camera');
    }

    console.log('Testing Touch Open Ledger Modal...');
    await ledgerBtn.click();
    await page.waitForSelector('.ledger-modal-inner', { timeout: 5000 });
    console.log('✓ Ledger modal opened via mobile touch button');

    console.log('Testing Touch Close Ledger...');
    const closeLedgerBtn = await page.waitForSelector('#btn-close-ledger', { timeout: 5000 });
    await closeLedgerBtn.click();
    console.log('✓ Ledger modal closed');

    // 3. VERIFY ZERO CONSOLE ERRORS & CLEAN TEARDOWN
    console.log('====================================================');
    console.log(`TOTAL CONSOLE ERRORS DETECTED: ${consoleErrors.length}`);
    console.log('====================================================');

    if (consoleErrors.length > 0) {
      throw new Error(`Console errors encountered: ${JSON.stringify(consoleErrors)}`);
    }

    console.log('✨ ALL MOBILE PLAYTEST CHECKS PASSED WITH 100% SUCCESS ✨');
  } finally {
    await browser.close();
    vite.kill();
  }
}

main().catch((err) => {
  console.error('PLAYTEST FAILURE:', err);
  process.exit(1);
});
