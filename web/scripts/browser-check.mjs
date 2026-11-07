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
const STANDARD_WIDTHS = [320, 390, 768, 1440];
// Phone widths around the point where the quick-link row stops fitting once the web font has swapped in.
const SWEEP_WIDTHS = [360, 375, 390, 412, 430, 440, 460, 480];
const WIDTHS = STANDARD_WIDTHS;
const WEIGHT_LIMIT = 250 * 1024;
const WA_PREFIX = 'https://wa.me/27833349357';
const TAB_STOPS = 40;

mkdirSync(SHOTS_DIR, { recursive: true });
const slug = (p) => (p === '/' ? 'home' : p.replace(/^\/|\/$/g, '').replace(/\//g, '-'));

const rows = [];
function record(page, width, check, ok, detail = '') {
  rows.push({ page, width, check, result: ok ? 'PASS' : 'FAIL', detail });
}


// Quick-link row: single scrolling row on phones. Every chip must be fully visible, or the row must
// signal that it scrolls (overflow + fade mask + a chip clipped mid-way at the right edge).
const PARTIAL_PX = 8;
async function quicknavState(page) {
  return page.evaluate(async () => {
    const q = document.querySelector('.mobile-quicknav');
    if (!q) return null;
    const cs = getComputedStyle(q);
    if (cs.display === 'none') return { hidden: true };
    q.scrollLeft = 0; // measure the resting state, not wherever an earlier Tab walk left the row
    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res))); // let the scroll handler run
    const qr = q.getBoundingClientRect();
    const chips = [...q.children].map((a) => {
      const r = a.getBoundingClientRect();
      return { label: a.textContent.trim(), left: r.left, right: r.right };
    });
    return {
      hidden: false,
      sw: q.scrollWidth,
      cw: q.clientWidth,
      edge: qr.right,
      maskImage: cs.maskImage || cs.webkitMaskImage || 'none',
      chips,
    };
  });
}
function judgeQuicknav(st) {
  const clipped = st.chips.filter((c) => c.right > st.edge + 0.5);
  if (clipped.length === 0) {
    // Nothing is clipped, so the right-edge fade must be OFF (a fade over a fully visible last chip dims it).
    const fadeOff = st.maskImage === 'none';
    return { ok: fadeOff, detail: `all ${st.chips.length} chips fully visible; sw=${st.sw} cw=${st.cw} mask=${fadeOff ? 'none' : 'ON'}` };
  }
  const overflow = st.sw > st.cw;
  const fade = st.maskImage !== 'none';
  const partial = st.chips.find((c) => c.left < st.edge - PARTIAL_PX && c.right > st.edge + PARTIAL_PX);
  const ok = overflow && fade && !!partial;
  return {
    ok,
    detail: `${clipped.length} clipped; overflow=${overflow} fade=${fade} partial=${partial ? `${partial.label} ${Math.round(partial.left)}..${Math.round(partial.right)} edge ${Math.round(st.edge)}` : 'none'}`,
  };
}
// Press Tab from the top of the page; every chip must receive focus and be fully inside the row's visible box.
async function quicknavTabReach(page, chipCount) {
  await page.evaluate(() => {
    // blur() alone leaves Chrome's sequential-focus start point wherever the earlier Tab walk ended (on a long
    // page that is the footer), so the first Tabs wrap around and the 14-press budget runs out before the chips.
    // Focusing then blurring the skip link at the top of the page moves the start point back there.
    const skip = document.querySelector('a.sr-only');
    skip?.focus();
    skip?.blur();
    document.activeElement?.blur();
    window.scrollTo(0, 0);
    document.querySelector('.mobile-quicknav').scrollLeft = 0;
  });
  const seen = new Map();
  for (let i = 0; i < 14 && seen.size < chipCount; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      const q = document.querySelector('.mobile-quicknav');
      if (!el || !q || el.parentElement !== q) return null;
      const r = el.getBoundingClientRect();
      const qr = q.getBoundingClientRect();
      return { label: el.textContent.trim(), inView: r.left >= qr.left - 0.5 && r.right <= qr.right + 0.5 };
    });
    if (info) seen.set(info.label, info.inView);
  }
  const hidden = [...seen].filter(([, v]) => !v).map(([k]) => k);
  return { reached: seen.size, hidden };
}

const browser = await chromium.launch({ executablePath: EXECUTABLE });

for (const path of PAGES) {
  for (const width of WIDTHS) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    const client = await context.newCDPSession(page);
    await client.send('Network.enable');
    await client.send('Page.enable');
    const mainFrameId = (await client.send('Page.getFrameTree')).frameTree.frame.id;
    const urls = new Map();
    const fromMain = new Map();
    let weight = 0;
    client.on('Network.requestWillBeSent', (e) => {
      urls.set(e.requestId, e.request.url);
      // The Maps embed is a third-party iframe: only requests from the top-level document count toward the budget.
      fromMain.set(e.requestId, e.frameId === mainFrameId);
    });
    client.on('Network.loadingFinished', (e) => {
      const url = urls.get(e.requestId) ?? '';
      if (fromMain.get(e.requestId) !== false && !url.includes('maps.google.com')) weight += e.encodedDataLength;
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

    // Quick-link row affordance and keyboard reach.
    const qn = await quicknavState(page);
    if (qn?.hidden) {
      record(path, width, 'quicknav hidden above 1360px', width > 1360, 'display:none');
    } else if (qn) {
      const j = judgeQuicknav(qn);
      record(path, width, 'quicknav fits or visibly scrolls', j.ok, j.detail);
      const reach = await quicknavTabReach(page, qn.chips.length);
      record(path, width, 'quicknav chips reachable by Tab, in view', reach.reached === qn.chips.length && reach.hidden.length === 0, `${reach.reached}/${qn.chips.length} reached; out of view: ${reach.hidden.join(',') || 'none'}`);
    } else {
      record(path, width, 'quicknav present', false, 'missing .mobile-quicknav');
    }

    // Bebas Neue ships weight 400 only: any heavier computed weight is a synthesised bold.
    const bebas = await page.evaluate(() => {
      const bad = [];
      let matched = 0;
      for (const el of document.querySelectorAll('body *')) {
        const cs = getComputedStyle(el);
        if (/bebas/i.test(cs.fontFamily.split(',')[0]) && el.textContent.trim()) {
          matched++;
          if (cs.fontWeight !== '400') bad.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}=${cs.fontWeight}`);
        }
      }
      return { bad: [...new Set(bad)], matched, headings: document.querySelectorAll('h1, h2').length };
    });
    record(
      path,
      width,
      'Bebas elements are weight 400',
      bebas.bad.length === 0 && (bebas.headings === 0 || bebas.matched > 0),
      bebas.bad.length ? bebas.bad.slice(0, 4).join(' ') : `${bebas.matched} Bebas elements checked`,
    );

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
  const expectDetails = path.startsWith('/services/');
  if (details.length === 0 && !expectDetails) {
    record(path, 'nojs', 'every <details> toggles (n/a)', true, 'n/a: none on this page');
  } else {
    record(path, 'nojs', 'every <details> toggles', details.length > 0 && toggled === details.length, `${toggled}/${details.length}`);
  }

  const fallback = await page.$('[data-estimator-fallback]');
  if (fallback) {
    record(path, 'nojs', 'estimator fallback visible', await fallback.isVisible());
  }
  await context.close();
}

// Quick-link sweep at common phone widths, on every checked page.
for (const path of PAGES) {
  for (const width of SWEEP_WIDTHS) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    await page.goto(BASE + path, { waitUntil: 'networkidle' });
    const qn = await quicknavState(page);
    const j = qn && !qn.hidden ? judgeQuicknav(qn) : { ok: false, detail: 'quicknav missing or hidden' };
    record(path, width, 'quicknav fits or visibly scrolls', j.ok, j.detail);
    await context.close();
  }
}

// The 404 page ships with the build: overflow, header and CTA hold there too.
for (const width of WIDTHS) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await context.newPage();
  const res = await page.goto(BASE + '/404.html', { waitUntil: 'networkidle' });
  record('/404.html', width, 'status 200 or 404', [200, 404].includes(res?.status() ?? 0), String(res?.status()));
  const m = await page.evaluate(() => {
    const cta = document.querySelector('.nav-cta');
    const r = cta?.getBoundingClientRect();
    return {
      sw: document.documentElement.scrollWidth,
      iw: window.innerWidth,
      nav: document.querySelector('.nav')?.getBoundingClientRect().height ?? -1,
      cta: r ? { h: r.height, inside: r.left >= 0 && r.right <= window.innerWidth } : null,
      h1: !!document.querySelector('h1'),
    };
  });
  record('/404.html', width, 'no horizontal overflow', m.sw <= m.iw, `${m.sw} <= ${m.iw}`);
  const limit = width <= 320 ? 140 : width <= 390 ? 130 : width <= 768 ? 140 : null;
  if (limit !== null) record('/404.html', width, `sticky header <= ${limit}px`, m.nav > 0 && m.nav <= limit, `${Math.round(m.nav)}px`);
  record('/404.html', width, 'header CTA visible, inside viewport, >= 44px', !!m.cta && m.cta.inside && m.cta.h >= 44, m.cta ? `h=${m.cta.h}` : 'missing .nav-cta');
  record('/404.html', width, 'has an h1', m.h1);
  await context.close();
}

// Legacy single-page anchors. A hash never reaches the server, so the Home page script redirects in the browser.
// Expected targets are hard-coded here as an independent oracle (the plan's legacy map), not read from src.
const LEGACY_REDIRECTS = [
  ['#pricing', /\/services\/caravan-service\/#pricing$/],
  ['#contact', /\/find-us\/$/],
  ['#promo', /\/services\/lift-kits\/$/],
  ['#kampi-widget', /\/#rentals$/],
];
const LEGACY_STAYS = ['#services', '#location'];
{
  const legacyContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const reached = async (page, re) => {
    try {
      await page.waitForURL(re, { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  };
  for (const [hash, re] of LEGACY_REDIRECTS) {
    const page = await legacyContext.newPage();
    await page.goto(`${BASE}/${hash}`, { waitUntil: 'load' });
    record(`/${hash}`, 'legacy', 'load redirects to its new home', await reached(page, re), page.url().replace(BASE, ''));
    await page.close();
  }
  for (const hash of LEGACY_STAYS) {
    const page = await legacyContext.newPage();
    await page.goto(`${BASE}/${hash}`, { waitUntil: 'load' });
    await page.waitForTimeout(500);
    record(`/${hash}`, 'legacy', 'current-page anchor is left alone', page.url() === `${BASE}/${hash}`, page.url().replace(BASE, ''));
    await page.close();
  }
  {
    // hashchange: the visitor is already on Home and clicks an old in-page link.
    const page = await legacyContext.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'load' });
    await page.evaluate(() => { location.hash = '#pricing'; });
    record('/', 'legacy', 'hashchange to #pricing redirects', await reached(page, /\/services\/caravan-service\/#pricing$/), page.url().replace(BASE, ''));
    await page.close();
  }
  await legacyContext.close();
}

await browser.close();

const pad =(s, n) => String(s).padEnd(n);
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
