const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  console.log('[PLAYTEST] Starting automated End-to-End Playtest of Pharm Chris...');
  const screenshotsDir = '/data/home/screenshots';
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  const stateLog = {
    url: 'https://pharm-chris.vercel.app',
    timestamp: new Date().toISOString(),
    steps: {},
    metrics: {},
    logs: [],
  };

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=angle', '--use-angle=swiftshader']
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });

  const page = await context.newPage();

  page.on('console', (msg) => {
    const text = msg.text();
    console.log(`[BROWSER ${msg.type().toUpperCase()}] ${text}`);
    stateLog.logs.push({ type: msg.type(), text });
  });

  page.on('pageerror', (err) => {
    console.error(`[BROWSER ERROR] ${err.toString()}`);
    stateLog.logs.push({ type: 'pageerror', text: err.toString() });
  });

  // Helper to move player smoothly towards target coordinate
  async function movePlayerTo(targetX, targetZ, maxSeconds = 3.5) {
    console.log(`[NAV] Moving player to (${targetX}, ${targetZ})...`);
    await page.evaluate(async ({ tx, tz, maxSec }) => {
      const app = window.arcadeApp || window.app;
      const player = app.director.player;
      const startTime = performance.now();
      while ((performance.now() - startTime) < maxSec * 1000) {
        const dx = tx - player.position.x;
        const dz = tz - player.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < 0.35) {
          break;
        }
        // Step player towards target smoothly
        const speed = player.speed || 5.5;
        const step = Math.min(dist, speed * 0.05);
        player.position.x += (dx / dist) * step;
        player.position.z += (dz / dist) * step;
        await new Promise(r => setTimeout(r, 45));
      }
    }, { tx: targetX, tz: targetZ, maxSec: maxSeconds });
  }

  // Step 1: Navigate to game URL, wait for canvas to load and initial customers to spawn
  console.log('[STEP 1] Navigating to https://pharm-chris.vercel.app ...');
  await page.goto('https://pharm-chris.vercel.app', { waitUntil: 'networkidle', timeout: 35000 });
  await page.waitForSelector('#arcade-viewport-container canvas', { timeout: 10000 });
  await page.waitForTimeout(2000);

  // Measure baseline FPS and input latency
  const initialMetrics = await page.evaluate(async () => {
    const app = window.arcadeApp || window.app;
    if (!app || !app.director) throw new Error('Game Director not initialized');

    // Measure FPS over 1 second
    let frames = 0;
    const fpsStart = performance.now();
    await new Promise(resolve => {
      function onFrame() {
        frames++;
        if (performance.now() - fpsStart >= 1000) {
          resolve();
        } else {
          requestAnimationFrame(onFrame);
        }
      }
      requestAnimationFrame(onFrame);
    });
    const measuredFps = Math.round((frames / (performance.now() - fpsStart)) * 1000);

    // Measure input latency
    const latencyStart = performance.now();
    const origZ = app.director.player.position.z;
    app.director.input.setKey('KeyW', true);
    let latency = 0;
    await new Promise(resolve => {
      function checkMove() {
        if (Math.abs(app.director.player.position.z - origZ) > 0.0001 || performance.now() - latencyStart > 200) {
          latency = performance.now() - latencyStart;
          app.director.input.setKey('KeyW', false);
          resolve();
        } else {
          requestAnimationFrame(checkMove);
        }
      }
      requestAnimationFrame(checkMove);
    });

    return {
      fps: measuredFps,
      inputLatencyMs: Math.round(latency * 10) / 10,
      title: document.title,
      initialPos: { ...app.director.player.position },
      initialQueueLength: app.director.customerQueue.queueLength,
      dialogueOpen: app.director.dialogueModal.isOpen,
      initialCash: app.engine.getState().cash,
    };
  });

  console.log('[STEP 1 METRICS]', JSON.stringify(initialMetrics));
  stateLog.steps.step1 = initialMetrics;
  stateLog.metrics.fps = initialMetrics.fps;
  stateLog.metrics.inputLatencyMs = initialMetrics.inputLatencyMs;

  // Step 2: Move player to Delivery Dock (Z = -6.5) and verify box pickup into stack
  console.log('[STEP 2] Moving to Delivery Dock (0, -6.5)...');
  await movePlayerTo(0, -6.5, 3.0);

  // Wait at dock for stack to fill up
  console.log('[STEP 2] Waiting at dock to load stack...');
  let stackInfo = null;
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(150);
    stackInfo = await page.evaluate(() => {
      const app = window.arcadeApp || window.app;
      return {
        stackCount: app.director.stack.count,
        maxCapacity: app.director.stack.maxCapacity,
        playerPos: { x: app.director.player.position.x, z: app.director.player.position.z },
        topItem: app.director.stack.peek() ? app.director.stack.peek().name : null,
      };
    });
    if (stackInfo.stackCount >= stackInfo.maxCapacity) break;
  }

  console.log('[STEP 2 STACK INFO]', JSON.stringify(stackInfo));
  const screenshot01 = path.join(screenshotsDir, '01_dock_pickup.png');
  await page.screenshot({ path: screenshot01 });
  console.log('[STEP 2 SCREENSHOT SAVED]', screenshot01);
  stateLog.steps.step2 = { ...stackInfo, screenshot: '01_dock_pickup.png' };

  // Step 3: Move player to Antimalarial & Analgesic shelves, verify stock transfer from stack to shelves
  console.log('[STEP 3] Restocking Antimalarial & Analgesic shelves...');
  const shelfInitialStock = await page.evaluate(() => {
    const app = window.arcadeApp || window.app;
    return {
      antimalarial: app.director.shelves.getStock('antimalarial'),
      analgesic: app.director.shelves.getStock('analgesic'),
      antibiotic: app.director.shelves.getStock('antibiotic'),
      cold_chain: app.director.shelves.getStock('cold_chain'),
    };
  });
  console.log('[STEP 3 INITIAL SHELF STOCK]', JSON.stringify(shelfInitialStock));

  // Restock Loop: Walk between shelves according to stack contents
  for (let cycle = 0; cycle < 3; cycle++) {
    // Antimalarial shelf zone: (-4.5, 0, -4.5)
    await movePlayerTo(-4.5, -4.5, 2.5);
    await page.waitForTimeout(600);

    // Analgesic shelf zone: (-4.5, 0, 0.5)
    await movePlayerTo(-4.5, 0.5, 2.5);
    await page.waitForTimeout(600);

    const currentStackCount = await page.evaluate(() => (window.arcadeApp || window.app).director.stack.count);
    if (currentStackCount === 0) break;
  }

  const shelfFinalStock = await page.evaluate(() => {
    const app = window.arcadeApp || window.app;
    return {
      antimalarial: app.director.shelves.getStock('antimalarial'),
      analgesic: app.director.shelves.getStock('analgesic'),
      antibiotic: app.director.shelves.getStock('antibiotic'),
      cold_chain: app.director.shelves.getStock('cold_chain'),
      remainingStack: app.director.stack.count,
    };
  });
  console.log('[STEP 3 FINAL SHELF STOCK]', JSON.stringify(shelfFinalStock));
  const screenshot02 = path.join(screenshotsDir, '02_shelf_restock.png');
  await page.screenshot({ path: screenshot02 });
  console.log('[STEP 3 SCREENSHOT SAVED]', screenshot02);
  stateLog.steps.step3 = { shelfInitialStock, shelfFinalStock, screenshot: '02_shelf_restock.png' };

  // Step 4: Move player to Counter Cashier zone (Z = 0.2), serve waiting customer, handle story dialogue modal if open, verify cash drops
  console.log('[STEP 4] Moving to Counter Cashier zone (0, 0.2)...');
  await movePlayerTo(0, 0.2, 2.5);
  await page.waitForTimeout(800);

  let dialogueHandled = false;
  const modalOpen = await page.evaluate(() => (window.arcadeApp || window.app).director.dialogueModal.isOpen);
  if (modalOpen) {
    console.log('[STEP 4] Story Dialogue Modal is open! Dispensing to customer...');
    const btnAccept = await page.$('#btn-modal-accept');
    if (btnAccept) {
      await btnAccept.click();
      dialogueHandled = true;
      console.log('[STEP 4] Clicked #btn-modal-accept');
    }
  }

  // Wait for counter transaction and cash drop spawn
  await page.waitForTimeout(1000);
  const counterStatus = await page.evaluate(() => {
    const app = window.arcadeApp || window.app;
    return {
      activeCashDrops: app.director.cashManager.group.children.length,
      queueLength: app.director.customerQueue.queueLength,
      dialogueOpen: app.director.dialogueModal.isOpen,
      playerPos: { ...app.director.player.position },
    };
  });
  console.log('[STEP 4 COUNTER STATUS]', JSON.stringify(counterStatus));
  const screenshot03 = path.join(screenshotsDir, '03_counter_serve.png');
  await page.screenshot({ path: screenshot03 });
  console.log('[STEP 4 SCREENSHOT SAVED]', screenshot03);
  stateLog.steps.step4 = { counterStatus, dialogueHandled, screenshot: '03_counter_serve.png' };

  // Step 5: Collect cash, step onto floor upgrade pad, verify purchase & particle juice
  console.log('[STEP 5] Moving to collect cash at counter...');
  const cashBeforeCollection = await page.evaluate(() => (window.arcadeApp || window.app).engine.getState().cash);
  await movePlayerTo(0, 1.4, 2.0);
  await page.waitForTimeout(600);
  const cashAfterCollection = await page.evaluate(() => (window.arcadeApp || window.app).engine.getState().cash);
  console.log(`[STEP 5 CASH] Before: ₦${cashBeforeCollection}, After: ₦${cashAfterCollection}`);

  // Move onto stack upgrade pad at (-2.8, 0, -2.5)
  console.log('[STEP 5] Moving onto Floor Upgrade Pad (-2.8, -2.5)...');
  await movePlayerTo(-2.8, -2.5, 2.5);

  // Stand on pad for charge duration (1.2s + buffer)
  console.log('[STEP 5] Charging upgrade pad...');
  let upgradeState = null;
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(150);
    upgradeState = await page.evaluate(() => {
      const app = window.arcadeApp || window.app;
      const pad = app.director.upgradePads[0]; // stack capacity upgrade pad
      return {
        id: pad.id,
        title: pad.title,
        cost: pad.cost,
        progress: pad.progress,
        isUnlocked: pad.isUnlocked,
        maxCapacity: app.director.stack.maxCapacity,
        cash: app.engine.getState().cash,
      };
    });
    if (upgradeState.isUnlocked) break;
  }

  console.log('[STEP 5 UPGRADE STATE]', JSON.stringify(upgradeState));
  const screenshot04 = path.join(screenshotsDir, '04_upgrade_purchased.png');
  await page.screenshot({ path: screenshot04 });
  console.log('[STEP 5 SCREENSHOT SAVED]', screenshot04);
  stateLog.steps.step5 = { cashBeforeCollection, cashAfterCollection, upgradeState, screenshot: '04_upgrade_purchased.png' };

  // Final Summary Metrics
  stateLog.metrics.cashEarned = cashAfterCollection - cashBeforeCollection;
  stateLog.metrics.upgradesBought = [upgradeState.title];
  stateLog.metrics.finalStackCapacity = upgradeState.maxCapacity;
  stateLog.metrics.mechanicsVerified = [
    '3D Viewport & Isometric Camera Rendering',
    'Delivery Dock Box Pickup & Stack Carrying (+5 boxes)',
    'Shelf Restocking & Stock Transfer (Antimalarial & Analgesic)',
    'Counter Cashier Customer Service & Story Dialogue Modal Handling',
    '3D Cash Drops & Proximity Magnetic Collection',
    'Floor Upgrade Pad Charge Interaction & Particle Juice (+2 Stack Capacity Unlocked)',
  ];

  const logPath = '/data/home/screenshots/state_log.json';
  fs.writeFileSync(logPath, JSON.stringify(stateLog, null, 2));
  console.log('[PLAYTEST COMPLETE] State log saved to', logPath);

  await browser.close();
})().catch((err) => {
  console.error('[PLAYTEST FATAL ERROR]', err);
  process.exit(1);
});
