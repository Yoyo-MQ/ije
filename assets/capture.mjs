/**
 * Captures screenshots and an animated GIF of the Ije SDK demo.
 *
 * Usage:
 *   YOYO_API_KEY=your_key node assets/capture.mjs
 *
 * Outputs to assets/screenshots/:
 *   tracker.gif        — animated GIF of the map building a trail (for README)
 *   tracker.png        — still frame of the map with popup open
 *   stats.png          — telemetry stat cards
 *   chart.png          — speed + battery charts
 *   full-dashboard.png — full dashboard view
 *
 * Prerequisites:
 *   npx playwright install chromium
 *   npm install -g gifski   (or brew install gifski on mac)
 *   — OR — ffmpeg for the GIF encoding fallback
 */

import pkg from '/home/tobey/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.js';
const { chromium } = pkg;
import { execSync } from 'child_process';
import { mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS_DIR = join(__dirname, 'screenshots');
mkdirSync(SCREENSHOTS_DIR, { recursive: true });

const API_KEY   = process.env.YOYO_API_KEY;
const DEMO_URL  = process.env.DEMO_URL || 'http://localhost:5173/ije/';
const DEVICE_LABEL = process.env.DEVICE_LABEL; // optional: filter to a specific device name

if (!API_KEY) {
  console.error('Error: set YOYO_API_KEY environment variable');
  process.exit(1);
}

const out = (file) => join(SCREENSHOTS_DIR, file);

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1200, height: 900 });

  console.log(`Opening ${DEMO_URL} …`);
  await page.goto(DEMO_URL, { waitUntil: 'networkidle' });

  // ── Connect ────────────────────────────────────────────────────────────────
  console.log('Connecting with API key…');
  await page.fill('#token-input', API_KEY);
  await page.click('#connect-btn');

  // Wait for the dashboard to appear (connect-bar replaces the panel)
  await page.waitForSelector('#ije-connect-bar', { state: 'visible', timeout: 15_000 });
  console.log('Connected.');

  // Wait for the device picker to become enabled
  await page.waitForFunction(() => {
    const wrap = document.getElementById('live-device-combobox');
    return wrap && !wrap.classList.contains('disabled');
  }, { timeout: 10_000 });

  // ── Pick a device ──────────────────────────────────────────────────────────
  console.log('Selecting device…');
  const deviceComboInput = page.locator('#live-device-combobox input');
  await deviceComboInput.click();

  if (DEVICE_LABEL) {
    await deviceComboInput.fill(DEVICE_LABEL);
    await page.waitForTimeout(300);
  }

  // Pick the first option in the dropdown
  const firstOption = page.locator('#live-device-combobox .combo-option').first();
  await firstOption.waitFor({ state: 'visible', timeout: 5_000 });
  const deviceName = await firstOption.textContent();
  console.log(`Picking device: ${deviceName}`);
  await firstOption.click();

  // Wait for the map component to render
  await page.waitForSelector('ije-map-tracker', { state: 'attached', timeout: 10_000 });
  await page.waitForTimeout(2_000); // give MapLibre time to initialise

  // ── Start simulation ───────────────────────────────────────────────────────
  console.log('Starting simulation…');
  const simulateBtn = page.locator('button:has-text("Simulate")');
  await simulateBtn.click();

  // ── Capture animated GIF frames ───────────────────────────────────────────
  console.log('Recording tracker animation (20 frames)…');
  const frameDir = join(SCREENSHOTS_DIR, '_frames');
  mkdirSync(frameDir, { recursive: true });

  const mapTracker = page.locator('ije-map-tracker').first();

  for (let frameIndex = 0; frameIndex < 20; frameIndex++) {
    await page.waitForTimeout(800);
    await mapTracker.screenshot({ path: join(frameDir, `frame-${String(frameIndex).padStart(3, '0')}.png`) });
    process.stdout.write(`  frame ${frameIndex + 1}/20\r`);
  }
  console.log('\nFrames captured.');

  // Assemble GIF with ffmpeg or gifski
  const gifPath = out('tracker.gif');
  try {
    execSync(`ffmpeg -y -framerate 1.25 -i "${join(frameDir, 'frame-%03d.png')}" -vf "scale=800:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" "${gifPath}"`, { stdio: 'inherit' });
    console.log(`GIF saved → ${gifPath}`);
  } catch {
    console.warn('ffmpeg not available — run manually:');
    console.warn(`  ffmpeg -framerate 1.25 -i "${join(frameDir, 'frame-%03d.png')}" -vf "scale=800:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" "${gifPath}"`);
  }

  // ── Still: tracker with popup open ────────────────────────────────────────
  console.log('Capturing tracker still with popup…');
  // Wait a few more frames so there is a visible trail
  await page.waitForTimeout(3_000);
  // Click the current-position circle to open the popup
  const mapCanvas = page.locator('ije-map-tracker canvas').first();
  const mapBox = await mapCanvas.boundingBox();
  if (mapBox) {
    // The current marker is approximately centred — click the map centre
    await page.mouse.click(mapBox.x + mapBox.width / 2, mapBox.y + mapBox.height / 2);
    await page.waitForTimeout(600);
  }
  await mapTracker.screenshot({ path: out('tracker.png') });
  console.log(`Saved → ${out('tracker.png')}`);

  // ── Still: telemetry stat cards ───────────────────────────────────────────
  console.log('Capturing stats…');
  const statsGrid = page.locator('#live-tracking-content > div:nth-child(3)');
  await statsGrid.screenshot({ path: out('stats.png') });
  console.log(`Saved → ${out('stats.png')}`);

  // ── Still: charts ─────────────────────────────────────────────────────────
  console.log('Capturing charts…');
  const chartsGrid = page.locator('#live-tracking-content > div:nth-child(4)');
  await chartsGrid.screenshot({ path: out('chart.png') });
  console.log(`Saved → ${out('chart.png')}`);

  // ── Full dashboard ─────────────────────────────────────────────────────────
  console.log('Capturing full dashboard…');
  await page.screenshot({ path: out('full-dashboard.png'), fullPage: false });
  console.log(`Saved → ${out('full-dashboard.png')}`);

  await browser.close();
  console.log('\nDone. Drop the files in assets/screenshots/ and push to GitHub.');
})();
