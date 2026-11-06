// Headless Chromium check against a running site (the nginx container).
// Plain Node: never imports from src (the seven routes below are an independent oracle).
// Env: BASE (default http://localhost:18260), PAGES (comma list), SHOTS_DIR (default /tmp/nk-shots), PW_CHROMIUM.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const BASE = (process.env.BASE ?? 'http://localhost:18260').replace(/\/$/, '');
const DEFAULT_PAGES = [
  '/',
  '/services/caravan-service/',
  '/services/repairs/',
  '/services/solar-electrical/',
  '/services/recoveries/',
  '/services/lift-kits/',
  '/find-us/',
];
const PAGES = (process.env.PAGES ? process.env.PAGES.split(',') : DEFAULT_PAGES).map((p) => p.trim()).filter(Boolean);
const SHOTS_DIR = process.env.SHOTS_DIR ?? '/tmp/nk-shots';
const EXECUTABLE =
  process.env.PW_CHROMIUM ??
  '/home/jpvoogt/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell';
const WIDTHS = [320, 390, 768, 1440];
const WEIGHT_LIMIT = 250 * 1024;
const WA_PREFIX = 'https://wa.me/27833349357';
const TAB_STOPS = 40;

mkdirSync(SHOTS_DIR, { recursive: true });
const slug = (p) => (p === '/' ? 'home' : p.replace(/^\/|\/$/g, '').replace(/\//g, '-'));

const rows = [];
function record(page, width, check, ok, detail = '') {
  rows.push({ page, width, check, result: ok ? 'PASS' : 'FAIL', detail });
}

const browser = await chromium.launch({ executablePath: EXECUTABLE });

for (const path of PAGES) {
  for (const width of WIDTHS) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    const client = await context.newCDPSession(page);
    await client.send('Network.enable');
    const urls = new Map();
    let weight = 0;
    client.on('Network.requestWillBeSent', (e) => urls.set(e.requestId, e.request.url));
    client.on('Network.loadingFinished', (e) => {
      const url = urls.get(e.requestId) ?? '';
      if (!url.includes('maps.google.com')) weight += e.encodedDataLength;
    });

    const res = await page.goto(BASE + path, { waitUntil: 'networkidle' });
    record(path, width, 'status 200', res?.status() === 200, String(res?.status()));

    // Horizontal overflow
    const overflow = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      iw: window.innerWidth,
    }));
    record(path, width, 'no horizontal overflow', overflow.sw <= overflow.iw, `${overflow.sw} <= ${overflow.iw}`);

    // Header CTA
    const cta = await page.evaluate(() => {
      const el = document.querySelector('.nav-cta');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        visible: cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0,
        inside: r.left >= 0 && r.right <= window.innerWidth && r.top >= 0,
        height: r.height,
        right: r.right,
        left: r.left,
      };
    });
    record(
      path,
      width,
      'header CTA visible, inside viewport, >= 44px',
      !!cta && cta.visible && cta.inside && cta.height >= 44,
      cta ? `h=${cta.height} l=${Math.round(cta.left)} r=${Math.round(cta.right)}` : 'missing .nav-cta',
    );

    // Page weight (first load, gzip on the wire, maps excluded)
    record(path, width, 'weight < 250 KB', weight < WEIGHT_LIMIT, `${(weight / 1024).toFixed(1)} KB`);

    // Tab walk
    let walkOk = true;
    let walkDetail = '';
    let stops = 0;
    for (let i = 0; i < TAB_STOPS; i++) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return { body: true };
        const cs = getComputedStyle(el);
        return {
          body: false,
          tag: el.tagName.toLowerCase(),
          cls: el.className && el.className.toString().slice(0, 30),
          style: cs.outlineStyle,
          w: parseFloat(cs.outlineWidth),
        };
      });
      if (info.body) break;
      stops++;
      if (info.style === 'none' || !(info.w > 0)) {
        walkOk = false;
        walkDetail = `no outline on <${info.tag} class="${info.cls}"> at stop ${stops}`;
        break;
      }
    }
    record(path, width, 'tab walk shows focus ring', walkOk, walkOk ? `${stops} stops` : walkDetail);

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: join(SHOTS_DIR, `${slug(path)}-${width}.png`), fullPage: true });
    await context.close();
  }
}

// No-JS pass at one phone width and one desktop width.
for (const path of PAGES) {
  const context = await browser.newContext({ viewport: { width: 390, height: 900 }, javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(BASE + path, { waitUntil: 'load' });

  const href = await page.getAttribute('.nav-cta', 'href');
  record(path, 'nojs', 'CTA href is a wa.me link', !!href && href.startsWith(WA_PREFIX), href ?? 'missing');

  const details = await page.$$('details');
  let toggled = 0;
  for (const d of details) {
    const summary = await d.$('summary');
    const before = await d.evaluate((el) => el.open);
    await summary.click();
    const after = await d.evaluate((el) => el.open);
    if (before !== after) toggled++;
  }
  record(path, 'nojs', 'every <details> toggles', toggled === details.length, `${toggled}/${details.length}`);

  const fallback = await page.$('[data-estimator-fallback]');
  if (fallback) {
    record(path, 'nojs', 'estimator fallback visible', await fallback.isVisible());
  }
  await context.close();
}

await browser.close();

const pad = (s, n) => String(s).padEnd(n);
console.log(`${pad('page', 30)} ${pad('width', 6)} ${pad('check', 46)} ${pad('result', 6)} detail`);
for (const r of rows) {
  console.log(`${pad(r.page, 30)} ${pad(r.width, 6)} ${pad(r.check, 46)} ${pad(r.result, 6)} ${r.detail}`);
}
const failed = rows.filter((r) => r.result === 'FAIL');
console.log(`\n${rows.length - failed.length}/${rows.length} PASS`);
if (failed.length) {
  console.error(`browser-check: FAIL (${failed.length})`);
  process.exit(1);
}
console.log('browser-check: ok');
