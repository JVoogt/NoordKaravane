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
    if (stops < 1) {
      walkOk = false;
      walkDetail = 'tab walk reached 0 focusable stops';
    }
    record(path, width, 'tab walk shows focus ring', walkOk, walkOk ? `${stops} stops` : walkDetail);

    // Sticky header height: the quick-link row must not wrap to a second row on phones.
    const headerH = await page.evaluate(() => document.querySelector('.nav')?.getBoundingClientRect().height ?? -1);
    const limit = width <= 320 ? 140 : width <= 390 ? 130 : width <= 768 ? 140 : null;
    if (limit !== null) record(path, width, `sticky header <= ${limit}px`, headerH > 0 && headerH <= limit, `${Math.round(headerH)}px`);

    // Bebas Neue ships weight 400 only: any heavier computed weight is a synthesised bold.
    const bebas = await page.evaluate(() => {
      const bad = [];
      for (const el of document.querySelectorAll('body *')) {
        const cs = getComputedStyle(el);
        if (/bebas/i.test(cs.fontFamily.split(',')[0]) && cs.fontWeight !== '400' && el.textContent.trim()) {
          bad.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}=${cs.fontWeight}`);
        }
      }
      return [...new Set(bad)];
    });
    record(path, width, 'Bebas elements are weight 400', bebas.length === 0, bebas.slice(0, 4).join(' '));

    // Trust strip: no orphan tile (a lone last-row tile narrower than the strip).
    const orphan = await page.evaluate(() => {
      const ul = document.querySelector('.hero-trust');
      if (!ul) return null;
      const tiles = [...ul.children].map((t) => t.getBoundingClientRect());
      const top = Math.max(...tiles.map((r) => Math.round(r.top)));
      const last = tiles.filter((r) => Math.round(r.top) === top);
      const strip = ul.getBoundingClientRect().width;
      const rowsCount = new Set(tiles.map((r) => Math.round(r.top))).size;
      return { lone: last.length === 1 && rowsCount > 1 && last[0].width < strip * 0.9, rowsCount, last: last.length };
    });
    if (orphan) record(path, width, 'trust strip has no orphan tile', !orphan.lone, `rows=${orphan.rowsCount} lastRow=${orphan.last}`);

    // Floating WhatsApp button: hidden on phones (the header carries the CTA), shown on larger screens.
    const wa = await page.evaluate(() => {
      const el = document.querySelector('.wa-float');
      return el ? getComputedStyle(el).display : 'missing';
    });
    record(path, width, width <= 700 ? 'wa-float hidden <= 700px' : 'wa-float shown > 700px', width <= 700 ? wa === 'none' : wa !== 'none' && wa !== 'missing', wa);

    // Body-bearing text must be >= 12px (the brand lockup subtitle is the one allowed exception).
    const tiny = await page.evaluate(() => {
      const bad = [];
      for (const el of document.querySelectorAll('body *')) {
        if (el.closest('.brand-txt')) continue;
        const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
        if (!own) continue;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        if (parseFloat(cs.fontSize) < 12) bad.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}=${cs.fontSize}`);
      }
      return [...new Set(bad)];
    });
    record(path, width, 'text >= 12px', tiny.length === 0, tiny.slice(0, 5).join(' '));

    // Decorative section numbers are hidden from screen readers.
    const secNums = await page.evaluate(() =>
      [...document.querySelectorAll('.sec-num')].filter((e) => e.textContent.trim().startsWith('\u00a7') && e.getAttribute('aria-hidden') !== 'true').length,
    );
    record(path, width, 'section numbers aria-hidden', secNums === 0, `${secNums} exposed`);

    // Service pages: a visible 44px+ call button next to the WhatsApp hero button.
    if (path.startsWith('/services/')) {
      const call = await page.evaluate(() => {
        const a = document.querySelector('.hero-actions a[href^="tel:"]');
        if (!a) return null;
        const r = a.getBoundingClientRect();
        return { h: r.height, text: a.textContent.trim(), href: a.getAttribute('href') };
      });
      record(path, width, 'hero call button 44px+ with number', !!call && call.h >= 44 && call.text === 'Call 083 334 9357' && call.href === 'tel:+27833349357', call ? `${call.text} h=${call.h}` : 'missing');
    }

    // Footer hours: every segment is nowrap so a time never breaks mid-range.
    const hoursWrap = await page.evaluate(() => {
      const segs = [...document.querySelectorAll('.foot-hours-seg')];
      return segs.length === 0 ? 'none' : segs.every((e) => getComputedStyle(e).whiteSpace === 'nowrap') ? 'ok' : 'wrap';
    });
    record(path, width, 'footer hours segments nowrap', hoursWrap === 'ok', hoursWrap);

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: join(SHOTS_DIR, `${slug(path)}-${width}.png`), fullPage: true });
    await context.close();
  }
}

// No-JS pass at one phone width and one desktop width.
for (const path of PAGES) {
  const context = await browser.newContext({ viewport: { width: 390, height: 900 }, javaScriptEnabled: false });
  const page = await context.newPage();
  const nojs = await page.goto(BASE + path, { waitUntil: 'load' });
  record(path, 'nojs', 'status 200', nojs?.status() === 200, String(nojs?.status()));

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
