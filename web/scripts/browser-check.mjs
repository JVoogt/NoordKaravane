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
if (PAGES.length === 0) {
  console.error('browser-check: FAIL no pages to check (PAGES is empty)');
  process.exit(1);
}
const SHOTS_DIR = process.env.SHOTS_DIR ?? '/tmp/nk-shots';
const EXECUTABLE =
  process.env.PW_CHROMIUM ??
  '/home/jpvoogt/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell';
const STANDARD_WIDTHS = [320, 390, 768, 1440];
// Either side of the layout breakpoints: 860/861 (fixed bar and header Call swap), 1080/1081 (quick-link row and
// nav links swap), 1280 (a common laptop width between the last breakpoint and the widest standard width) and
// 1920 (a full HD screen, well past the 1240px content column).
const BRACKET_WIDTHS = [860, 861, 1080, 1081, 1280, 1920];
// Widths the country plates are measured at: phones, either side of the point where the hero goes to two columns
// (861px, where the plates' column is at its narrowest), a small laptop and the widest standard width.
const PLATE_WIDTHS = [320, 390, 861, 1024, 1440];
const PLATE_PAGES = ['/', '/services/recoveries/'];
// Elements that may reach past the right edge on purpose. Only the quick-link chips: their row scrolls sideways
// inside its own box (overflow-x: auto), so a chip past the edge is reachable by scrolling the row.
const CLIPPED_BY_DESIGN = ['.mobile-quicknav a'];
// Phone widths around the point where the quick-link row stops fitting once the web font has swapped in.
const SWEEP_WIDTHS = [360, 375, 390, 412, 430, 440, 460, 480];
const WIDTHS = STANDARD_WIDTHS;
const WEIGHT_LIMIT = 250 * 1024;
const WA_PREFIX = 'https://wa.me/27833349357';
// Oracles for the estimator checks (hard-coded: plain JS never imports src).
const NEUTRAL_PAGE = '/services/caravan-service/';
const NEUTRAL_ESTIMATE_HREF = `${WA_PREFIX}?text=Hi%2C%20I'd%20like%20an%20estimate%20for%20a%20caravan%20service.`;
// The Tab walks stop when focus comes back to an element they have already visited. This is only the budget that
// keeps a broken page from looping for ever: reaching it is a FAIL (the longest page has under 80 stops).
const TAB_BUDGET = 400;
// Oracles for the Home message builder (hard-coded: plain JS never imports src).
const COMPOSE_DEFAULT = "Hi, I'd like to book a service. I can send a photo.";
const COMPOSE_LIFT = "Hi, I'd like a 50 mm lift kit fitted. It's a Jurgens Exclusive 2014. I can send a photo.";
// Selectors the 2026-11-14 redesign added to the checks below, by the page that must render them ('*' = every
// page). A selector that matches nothing on its page fails: a stale selector must never pass at 0 elements.
// Phase 2 (service pages, Find us): what every page hero, FAQ and closing band must render.
const PAGE_SYSTEM = ['header.hero.on-ink .crumbs a', '.hero h1 .hi', '.hero .hero-lede', '.hero-actions a.btn-primary', '.hero-actions a.btn-ghost', 'summary.faq-q .faq-toggle svg', '.faq-a p', '.band .contact-main p', '.band .contact-actions a'];
const REDESIGN_SELECTORS = {
  '/services/caravan-service/': [...PAGE_SYSTEM, '.hero-photo img', '.hero-facts dt', '.hero-facts dd', '.hero-proof a', '.page-nav a', '.price .amt sub', '.svc-includes li', '.estimator > p', '.est-opt', '.est-chk', '.est-chk-price', '.est-label', '.est-total-label', '.est-total-note', '.book-row p', '.inspection-summary p', '.rep-finding p', '.step p', '#related .board-price', '.band .find-facts dt', '.find-facts dd small', '.band-loc > a.btn'],
  '/services/repairs/': [...PAGE_SYSTEM, '.hero-photo img', '.hero-facts dt', '.hero-facts dd', '.hero-proof a', '.svc-cols h2', '.svc-body p', '#related .board-price', '.band .find-facts dt', '.band-loc > a.btn'],
  '/services/solar-electrical/': [...PAGE_SYSTEM, '.hero-photo img', '.hero-facts dt', '.hero-facts dd', '.hero-proof a', '.svc-split h2', '.svc-body li', '.contact-aside a', '.band .find-facts dt', '.band-loc > a.btn'],
  '/services/recoveries/': [...PAGE_SYSTEM, '.hero-badge', '.hero-safety', '.checklist li', '.hero .plates li', '.hero-facts dt', '.hero-facts dd', '.hero-proof a', '#related .board-price', '.band .find-facts dt', '.band-loc > a.btn', '.band .find-tel', '.band .find-facts a[href^="tel:"]'],
  '/services/lift-kits/': [...PAGE_SYSTEM, '.hero-photo img', '.hero-cap', '.hero-facts dt', '.hero-facts dd', '.hero-proof a', '.kit-price .amt', '.kit-price .unit', '.specs dt', '.specs dd', '#related .board-price', '.band .find-facts dt', '.band-loc > a.btn'],
  '/find-us/': [...PAGE_SYSTEM, '.hero-photo img', '#location .find-facts dt', '.find-facts dd small', '.hrs span', '.map-bar-addr span', '.loc-map-wait', '.loc-photo figcaption', '.loc-text p', '.loc-services a', '#location .find-tel', '#location .find-facts a[href^="tel:"]'],
  '*': ['body > .bar a.bar-wa', 'body > .bar a.bar-call', '.topbar', '.nav a.nav-call', '.nav-cta', '.mobile-quicknav a'],
  '/': ['.hero .lede', '.board-need', '.board-notes p', '.rec-grid p', '.find-lede', '.hero-tag-k', '.hero-tag-f', '.hero-tag-p', '.plates span', '.rep-state', '.rep-sub', '.rep-status', '.rep-finding p', '.board-price', 'a.board-row', '.find-facts dt', '.find-facts dd', '.picks span', '.picks label', '.compose-label', '.compose-live', '.steps-link', '.rev-links a', '#location .find-tel', '#location .find-facts a[href^="tel:"]'],
};
// Tap targets (44px floor on phones), by the page that must show them ('*' = every page). Typed by hand from the
// built pages. A selector that matches no visible element on its page fails: a floor that measures nothing is no
// floor. The top line's links are only links above 860px, except the Recoveries call line, a link at every width.
const SERVICE_TAPS = ['summary.faq-q', '.hero-proof a', '.crumbs a'];
const TAP_TARGETS = {
  '*': ['body > .bar a', '.foot-col a', 'a.brand', '.mobile-quicknav a'],
  '/': ['.find-tel', '.find-facts a[href^="tel:"]', '.rev-links a', '.steps-link', '.picks label', 'a.board-row', '.hero-trust-item a', 'a.review-date'],
  '/services/caravan-service/': [...SERVICE_TAPS, 'a.board-row', '.page-nav a'],
  '/services/repairs/': [...SERVICE_TAPS, 'a.board-row'],
  '/services/solar-electrical/': SERVICE_TAPS,
  '/services/recoveries/': [...SERVICE_TAPS, 'a.board-row', '.find-tel', '.find-facts a[href^="tel:"]', '.topbar-call', '.topbar a'],
  '/services/lift-kits/': [...SERVICE_TAPS, 'a.board-row'],
  '/find-us/': ['summary.faq-q', '.crumbs a', '.find-tel', '.find-facts a[href^="tel:"]', '.loc-services a', '.map-bar a'],
};
// Every tap-target selector, for the pages that do not have to show it: whatever it does match is still measured.
const ALL_TAPS = [...new Set(Object.values(TAP_TARGETS).flat())];
// The web fonts every page loads (Base.astro): each face must have arrived, not its local stand-in.
const WEB_FONTS = [['Bebas Neue', '400'], ['Barlow', '400'], ['Barlow', '600'], ['Barlow', '700']];
// How many elements each readability-floor selector matched, summed over every page and width (see the end).
const floorMatches = new Map();

mkdirSync(SHOTS_DIR, { recursive: true });
const slug = (p) => (p === '/' ? 'home' : p.replace(/^\/|\/$/g, '').replace(/\//g, '-'));

const rows = [];
function record(page, width, check, ok, detail = '') {
  rows.push({ page, width, check, result: ok ? 'PASS' : 'FAIL', detail });
}

// Every page the checks open comes from here. The live Google Maps embed on /find-us/ is aborted: it is a
// third-party frame that can keep the network busy past the 30s navigation limit, and no row needs the real map
// (the rows about the map frame assert what the page itself provides).
// It also listens for what the page itself reports: an uncaught exception (pageerror) or a console error. They are
// kept per checked page (the row label visit() was given) and judged in one row per page at the end of the run.
// A request the run blocks on purpose logs "Failed to load resource" for its own URL: those are not the page's
// fault and are left out, by URL (see expectFailure).
const pageProblems = new Map(); // row page -> Set of messages
const BLOCKED_ON_PURPOSE = [/maps\.google\.com/, /google\.com|gstatic\.com|googleapis\.com/];
const labelOf = new WeakMap(); // page -> the row page of its last visit()
const expected = new WeakMap(); // page -> extra URL patterns whose load failure this page expects
function expectFailure(page, pattern) {
  expected.set(page, [...(expected.get(page) ?? []), pattern]);
}
function noteProblem(page, message) {
  const label = labelOf.get(page) ?? page.url().replace(BASE, '');
  if (!pageProblems.has(label)) pageProblems.set(label, new Set());
  pageProblems.get(label).add(message.replace(/\s+/g, ' ').slice(0, 200));
}
async function openPage(context) {
  const page = await context.newPage();
  await page.route(/maps\.google\.com/, (r) => r.abort());
  // Shared by the Tab walks: where the focus ring of a focused element is drawn, and whether one is drawn at all.
  // A radio drawn at opacity 0 (.picks) shows its ring on the label text beside it, so that text is what is read:
  // the radio's own outline is there in the computed style and invisible on screen.
  await page.addInitScript(() => {
    window.__focusRing = (el) => {
      const on = getComputedStyle(el).opacity === '0' && el.nextElementSibling ? el.nextElementSibling : el;
      const cs = getComputedStyle(on);
      const r = on.getBoundingClientRect();
      return { on, cs, drawn: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0 && on.checkVisibility() && r.width > 0 && r.height > 0 };
    };
  });
  page.on('pageerror', (e) => noteProblem(page, `uncaught: ${e?.message ?? e}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const from = m.location()?.url ?? '';
    const onPurpose = [...BLOCKED_ON_PURPOSE, ...(expected.get(page) ?? [])].some((re) => re.test(from));
    if (!(onPurpose && /Failed to load resource/.test(m.text()))) noteProblem(page, `console: ${m.text()}${from ? ` (${from.replace(BASE, '')})` : ''}`);
  });
  return page;
}
// Every navigation goes through here. One that fails (a timeout, a refused connection) or comes back with no
// response at all is a FAIL row for that page and width, and the caller moves on: it must never throw and take
// every other row of the run with it, and it must never drop a page from the run without a row.
async function visit(page, url, waitUntil, rowPage, rowWidth) {
  labelOf.set(page, rowPage);
  if (!pageProblems.has(rowPage)) pageProblems.set(rowPage, new Set());
  try {
    const res = await page.goto(url, { waitUntil });
    if (!res) record(rowPage, rowWidth, 'page loads', false, `no response for ${url}`);
    return res;
  } catch (e) {
    record(rowPage, rowWidth, 'page loads', false, String(e?.message ?? e).split('\n')[0]);
    return null;
  }
}
// Rewrites a page's HTML on its way to the browser (the built files are never touched): every match of pattern
// becomes replacement. Returns a counter of the matches cut, read after the visit: zero means nothing was tested.
async function stripFromHtml(page, url, pattern, replacement) {
  const cuts = { n: 0 };
  await page.route(url, async (route) => {
    const response = await route.fetch();
    const html = await response.text();
    cuts.n += html.match(pattern)?.length ?? 0;
    await route.fulfill({ response, body: html.replace(pattern, replacement) });
  });
  return cuts;
}
// One page at one width: its own context and page, and whatever fn does with them. A check that throws (a missing
// element read as if it were there, a click that never lands) becomes a FAIL row for that page and width, and the
// run carries on: the table and the totals always print, and the exit code is non-zero because of the FAIL.
async function guarded(rowPage, rowWidth, contextOptions, fn) {
  let context;
  try {
    context = await browser.newContext(contextOptions);
    const page = await openPage(context);
    await fn(page, context);
  } catch (e) {
    record(rowPage, rowWidth, 'checks ran to the end without an exception', false, String(e?.stack ?? e).split('\n').slice(0, 2).join(' ').replace(/\s+/g, ' ').slice(0, 300));
  } finally {
    await context?.close().catch(() => {});
  }
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

// No sideways scroll, and nothing drawn past the right edge. html and body are overflow-x: clip, so scrollWidth
// alone cannot see an element that is cut off there: every visible element's right edge is measured as well.
async function overflowRow(page, path, width) {
  const o = await page.evaluate((clipped) => {
    const iw = window.innerWidth;
    const past = [];
    let seen = 0;
    for (const el of document.querySelectorAll('body *')) {
      if (!el.checkVisibility()) continue;
      if (clipped.some((sel) => el.matches(sel))) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      seen++;
      if (r.right > iw + 1) past.push(`${el.tagName.toLowerCase()}.${String(el.className.baseVal ?? el.className).split(' ')[0]} right=${Math.round(r.right)}`);
    }
    return { sw: document.documentElement.scrollWidth, iw, past: [...new Set(past)], seen };
  }, CLIPPED_BY_DESIGN);
  record(path, width, 'no horizontal overflow', o.sw <= o.iw && o.past.length === 0 && o.seen > 20, o.past.length ? `past the right edge (${o.iw}px): ${o.past.slice(0, 4).join('; ')}` : `${o.sw} <= ${o.iw}; ${o.seen} visible elements inside the right edge`);
}

// Country plates (Home recoveries band, Recoveries hero): every code and every name is drawn inside its plate's
// border. "Mozambique" used to run over the border where five plates shared a narrow column.
async function platesRow(page, path, width) {
  const p = await page.evaluate(() => {
    const spill = [];
    let names = 0;
    for (const el of document.querySelectorAll('.plates li b, .plates li span')) {
      const li = el.closest('li');
      if (!li.checkVisibility()) continue;
      if (el.tagName === 'SPAN') names++;
      const range = document.createRange();
      range.selectNodeContents(el);
      const text = range.getBoundingClientRect();
      const box = li.getBoundingClientRect();
      const border = parseFloat(getComputedStyle(li).borderLeftWidth);
      const over = Math.max(box.left + border - text.left, text.right - (box.right - border));
      if (over > 0.5) spill.push(`"${el.textContent.trim()}" ${Math.round(text.width)}px text in a ${Math.round(box.width - 2 * border)}px plate`);
    }
    const tops = new Set([...document.querySelectorAll('.plates li')].map((li) => Math.round(li.getBoundingClientRect().top)));
    return { names, spill, rows: tops.size };
  });
  record(path, width, 'country plate codes and names fit inside their plates', p.names >= 5 && p.spill.length === 0, p.spill.length ? p.spill.join('; ') : `${p.names} names in ${p.rows} row(s)`);
}

// Colours of single pixels of what is on screen now ([x, y] in CSS px of the viewport, device scale 1). The
// screenshot is decoded in the page itself (a canvas), so the run needs no image library.
async function pixelsAt(page, points) {
  const b64 = (await page.screenshot()).toString('base64');
  return page.evaluate(async ({ b64, points }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const ctx = new OffscreenCanvas(img.naturalWidth, img.naturalHeight).getContext('2d');
    ctx.drawImage(img, 0, 0);
    return points.map(([x, y]) => [...ctx.getImageData(x, y, 1, 1).data.slice(0, 3)]);
  }, { b64, points });
}

// Quick-link row: what shows through its right-edge fade is the header's ink, not the light page under it. The
// fade is a mask on the row, so the row's own background fades with it: the ink has to sit on a layer the mask
// does not touch. Pixels are read from the row's top and bottom padding at its right edge (no chip is ever there),
// where the mask is all but transparent.
async function quicknavBackingRow(page, path, width, maskImage) {
  const r = await page.evaluate(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    const b = document.querySelector('.mobile-quicknav').getBoundingClientRect();
    return { right: Math.floor(b.right), top: Math.round(b.top), bottom: Math.round(b.bottom) };
  });
  const points = [[r.right - 1, r.top + 4], [r.right - 2, r.top + 6], [r.right - 1, r.bottom - 4], [r.right - 2, r.bottom - 6]];
  const px = await pixelsAt(page, points);
  const ink = px.every(([red, green, blue]) => red <= 40 && green <= 40 && blue <= 40);
  record(path, width, 'quicknav right edge is ink behind the fade', ink, `fade ${maskImage === 'none' ? 'off' : 'on'}; pixels ${px.map((c) => `rgb(${c.join(',')})`).join(' ')}`);
}

// Floating WhatsApp action. Redesign (2026-11-14): it is the WhatsApp link of the fixed bar, shown at 860px and
// below (44px+, pinned to the bottom edge) and not shown above that, where the pinned header carries the CTA.
// It was a round floating button, hidden at 700px and below and shown above. Real visibility is measured: the
// link's own display says nothing when the bar around it is hidden.
async function fixedBarRow(page, path, width) {
  const wa = await page.evaluate(() => {
    const el = document.querySelector('body > .bar a.wa-float');
    if (!el) return 'missing';
    if (!el.checkVisibility()) return 'hidden';
    const r = el.getBoundingClientRect();
    const fixed = getComputedStyle(el.parentElement).position === 'fixed';
    return fixed && r.height >= 44 && r.left >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight + 1 && r.top >= window.innerHeight - 120 ? 'shown' : `misplaced ${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)} fixed=${fixed}`;
  });
  record(path, width, width <= 860 ? 'wa-float (fixed bar) shown <= 860px' : 'wa-float (fixed bar) hidden > 860px', width <= 860 ? wa === 'shown' : wa === 'hidden', wa);
}

// Quick-link row affordance and keyboard reach.
async function quicknavRows(page, path, width) {
  const qn = await quicknavState(page);
  if (qn?.hidden) {
    // Redesign (2026-11-14): the nav links fit in the bar from 1081px, so the chip row ends there (it was 1361px).
    record(path, width, 'quicknav hidden above 1080px', width > 1080, 'display:none');
  } else if (qn && width > 1080) {
    record(path, width, 'quicknav hidden above 1080px', false, 'the chip row is still shown');
  } else if (qn) {
    const j = judgeQuicknav(qn);
    record(path, width, 'quicknav fits or visibly scrolls', j.ok, j.detail);
    await quicknavBackingRow(page, path, width, qn.maskImage);
    const reach = await quicknavTabReach(page, qn.chips.length);
    record(path, width, 'quicknav chips reachable by Tab, in view', reach.reached === qn.chips.length && reach.hidden.length === 0, `${reach.reached}/${qn.chips.length} reached; out of view: ${reach.hidden.join(',') || 'none'}`);
  } else {
    record(path, width, 'quicknav present', false, 'missing .mobile-quicknav');
  }
}

// Call action: a 44px Call link is on screen at every width. Redesign (2026-11-14): above 860px, and on Recoveries
// at every width, it is the header link beside the WhatsApp CTA (the number as text, or the filled "Call" button);
// at 860px and below every other page carries it in the fixed bar at the bottom of the screen instead.
// The tel: number and the aria-label are hard-coded oracles.
async function headerCallRow(page, path, width) {
  const hc = await page.evaluate(() => {
    const a = document.querySelector('.nav a.nav-call');
    const cta = document.querySelector('.nav-cta');
    if (!a || !cta) return null;
    const r = a.getBoundingClientRect();
    const c = cta.getBoundingClientRect();
    const cs = getComputedStyle(a);
    const b = document.querySelector('body > .bar a[href="tel:+27833349357"]');
    const br = b?.getBoundingClientRect();
    return {
      href: a.getAttribute('href'),
      label: a.getAttribute('aria-label'),
      w: r.width,
      h: r.height,
      visible: cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0,
      inside: r.left >= 0 && r.right <= window.innerWidth,
      beside: r.right <= c.left + 1 && Math.abs(r.top - c.top) < 30,
      // The fixed bar's Call link: shown, 44px+, inside the viewport and pinned to its bottom edge.
      bar: !!br && !!b.checkVisibility() && br.width >= 44 && br.height >= 44 && br.left >= 0 && br.right <= window.innerWidth && br.bottom <= window.innerHeight + 1 && br.top >= window.innerHeight - 120,
    };
  });
  const inHeader = width > 860 || path === '/services/recoveries/';
  const identity = !!hc && hc.href === 'tel:+27833349357' && hc.label === 'Call Noord Karavane on 083 334 9357';
  const ok = identity && (inHeader ? hc.visible && hc.inside && hc.beside && hc.w >= 44 && hc.h >= 44 : !hc.visible && hc.bar);
  record(path, width, inHeader ? 'header Call link 44px, beside the WhatsApp CTA, inside viewport' : 'Call link 44px in the fixed bar (header number hidden at 860px and below)', ok, hc ? `${Math.round(hc.w)}x${Math.round(hc.h)} href=${hc.href} label=${hc.label} beside=${hc.beside} bar=${hc.bar}` : 'missing .nav a.nav-call');
}

// Round 3 (design and UX review fixes). Every row asserts something the review found missing or wrong.
async function roundThreeChecks(page, path, width) {
  const service = path.startsWith('/services/');
  const isHome = path === '/';
  const isFind = path === '/find-us/';
  await headerCallRow(page, path, width);

  // Closing CTA band (the Home "Bring her in" band) ends every page's main content.
  const band = await page.evaluate(() => {
    const last = document.querySelector('main > section:last-of-type');
    const c = last?.querySelector('.contact');
    if (!c) return null;
    const wa = c.querySelector('a[href^="https://wa.me/27833349357"]');
    const tel = c.querySelector('a[href="tel:+27833349357"]');
    return { wa: !!wa, tel: !!tel, h: Math.min(...[wa, tel].filter(Boolean).map((a) => a.getBoundingClientRect().height)) };
  });
  record(path, width, 'closing CTA band is the last section, WhatsApp and Call 44px+', !!band && band.wa && band.tel && band.h >= 44, band ? `wa=${band.wa} tel=${band.tel} minH=${band.h}` : 'no .contact in the last main section');

  // Hero second column. Phase 2 (2026-11-14): it is the hero photo, or on Recoveries the block with what to send
  // and the country plates, and it sits to the right of the hero text above 860px (the Home hero's breakpoint) and
  // under it at 860px and below. It was a panel of fact and contact cards that moved beside the text from 1100px.
  if (service || isFind) {
    const hp = await page.evaluate(() => {
      const m = document.querySelector('.hero .hero-text');
      const p = document.querySelector('.hero .hero-photo, .hero .hero-side');
      if (!m || !p) return null;
      const a = m.getBoundingClientRect();
      const b = p.getBoundingClientRect();
      return { right: b.left >= a.right - 1 && b.height > 0, stacked: b.top >= a.bottom - 1 && b.height > 0 };
    });
    const want = width > 860 ? 'right' : 'stacked';
    record(path, width, `hero second column is ${want === 'right' ? 'right of' : 'under'} the hero text`, !!hp && (want === 'right' ? hp.right : hp.stacked), hp ? `right=${hp.right} stacked=${hp.stacked}` : 'no .hero-photo or .hero-side beside .hero-text');
  }

  // Tap targets on phones: FAQ rows, inline phone links, the Google chip, footer links and any link in the top line
  // are 44px+. Every selector is measured wherever it shows; the ones this page must show (TAP_TARGETS) fail when
  // nothing visible matches them.
  if (width <= 700) {
    const want = [...TAP_TARGETS['*'], ...(TAP_TARGETS[path] ?? [])];
    const taps = await page.evaluate(({ all, want }) => {
      const bad = [];
      const shown = {};
      for (const sel of all) {
        shown[sel] = 0;
        for (const el of document.querySelectorAll(sel)) {
          const r = el.getBoundingClientRect();
          if (r.width === 0) continue;
          shown[sel]++;
          if (r.height < 43.5 || r.width < 43.5) bad.push(`${sel}=${Math.round(r.width)}x${Math.round(r.height)}`);
        }
      }
      return { bad: [...new Set(bad)], none: want.filter((sel) => shown[sel] === 0), measured: Object.values(shown).reduce((a, b) => a + b, 0) };
    }, { all: ALL_TAPS, want });
    const detail = [taps.bad.join(' '), taps.none.length ? `no visible match for: ${taps.none.join(', ')}` : ''].filter(Boolean).join('; ');
    record(path, width, 'tap targets >= 44px (FAQ, phone links, Google chip, footer and top-line links)', taps.bad.length === 0 && taps.none.length === 0, detail || `${taps.measured} targets measured, all ${want.length} expected selectors shown`);
  }

  // Top line: no moving text at any width (WCAG 2.2.2).
  const tick = await page.evaluate(() => {
    const t = document.querySelector('.topbar-track');
    return t ? getComputedStyle(t).animationName : 'missing';
  });
  if (path === '/services/recoveries/') {
    // Recoveries has no ticker at all: one static 24/7 line (asserted in remediationChecks).
    record(path, width, 'recovery topbar does not move', tick === 'missing', `track=${tick}`);
  } else {
    // Redesign (2026-11-14): the top line no longer scrolls at any width, so there is nothing to pause (WCAG 2.2.2
    // is met by not moving at all). It was: static on phones, paused on hover above 700px.
    record(path, width, 'top line is static (no moving text)', tick === 'none', `animation-name=${tick}`);
  }

  // Quick-link row hides on scroll down and returns on scroll up and on Tab (phone widths only, JS on).
  if (width <= 768) {
    // "Visible header" = the nav's bottom edge in the viewport while it is stuck to the top. Its own box (and so
    // the page below it) must not change height: a collapsing sticky header would make the content jump.
    // The chip row hangs under the brand row (absolute): it counts as visible while its opacity is above half.
    const navBottom = () =>
      page.evaluate(() => {
        const nav = document.querySelector('.nav').getBoundingClientRect();
        const row = document.querySelector('.mobile-quicknav');
        return Number(getComputedStyle(row).opacity) > 0.5 ? row.getBoundingClientRect().bottom : nav.bottom;
      });
    // The ink layer behind the row (the nav's ::after) must come and go with the row: left behind, it would be a
    // dark band over the page; gone while the row shows, the fade would show the page again.
    const backing = () =>
      page.evaluate(() => {
        const cs = getComputedStyle(document.querySelector('.nav'), '::after');
        return cs.content === 'none' ? 'none' : cs.opacity;
      });
    // Where <main> starts in the document: it must not move when the row hides (no content jump).
    const navBox = () => page.evaluate(() => Math.round(document.querySelector('main').getBoundingClientRect().top + window.scrollY));
    const jump = (y) => page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), y);
    // Focus inside the header deliberately keeps the row open, so start from a blurred page.
    await page.evaluate(() => document.activeElement?.blur());
    await jump(0);
    await page.waitForTimeout(1000); // longer than the 800ms the row stays put after a Tab press
    const boxRest = await navBox();
    await jump(900);
    await page.waitForTimeout(500);
    const down = await navBottom();
    const boxDown = await navBox();
    const backingDown = await backing();
    await jump(700);
    await page.waitForTimeout(500);
    const up = await navBottom();
    const backingUp = await backing();
    await jump(900);
    await page.waitForTimeout(500);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(500);
    const tab = await navBottom();
    await jump(0);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const slide = await page.evaluate(() => getComputedStyle(document.querySelector('.nav')).transitionDuration);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    record(path, width, 'header slide has no transition under prefers-reduced-motion', slide === '0s', `transition-duration=${slide}`);
    record(path, width, 'quicknav hides on scroll down, shows on scroll up and on Tab, without moving the content', down <= up - 40 && tab >= up - 2 && boxDown === boxRest, `visible: down=${Math.round(down)} up=${Math.round(up)} afterTab=${Math.round(tab)}; main top ${boxRest}px -> ${boxDown}px`);
    record(path, width, 'quicknav ink backing hides and returns with the row', backingDown === '0' && backingUp === '1', `opacity of .nav::after: hidden=${backingDown} shown=${backingUp}`);
  }

  // Page-specific rows.
  if (path === '/') {
    const chips = await page.evaluate(() => [...document.querySelectorAll('.hero-trust-item')].map((e) => e.textContent.trim()));
    record(path, width, 'Home trust chips do not repeat "WhatsApp direct"', chips.length > 0 && !chips.some((c) => /whatsapp direct/i.test(c)), chips.join(' | ') || 'no .hero-trust-item');
  }
  if (path === '/services/recoveries/') {
    const r = await page.evaluate(() => {
      const top = (s) => document.querySelector(s)?.getBoundingClientRect().top ?? null;
      const badge = document.querySelector('.hero-badge');
      const h1 = document.querySelector('h1').getBoundingClientRect();
      const bg = (el) => (el ? getComputedStyle(el).backgroundColor : null);
      const call = document.querySelector('.hero-actions a[href^="tel:"]');
      const wa = document.querySelector('.hero-actions a[href^="https://wa.me/"]');
      const b = badge?.getBoundingClientRect();
      return {
        actions: top('.hero-actions'),
        facts: top('.hero .hero-facts'),
        chips: top('.hero .plates'),
        badgeText: badge?.textContent.trim() ?? null,
        badgeSize: badge ? parseFloat(getComputedStyle(badge).fontSize) : 0,
        // Phase 2: the badge sits under the H1 (no label above a headline), so the gap is to the H1's nearer edge.
        badgeGap: b ? Math.min(Math.abs(h1.top - b.bottom), Math.abs(b.top - h1.bottom)) : null,
        badgeShown: !!badge?.checkVisibility(),
        badgeInHours: !!badge?.closest('.find-facts, .band'),
        // Call is the one filled button; WhatsApp is the outlined second choice. Same rule in the closing band.
        primaryCall: !!call && !!wa && bg(call) !== 'rgba(0, 0, 0, 0)' && bg(wa) === 'rgba(0, 0, 0, 0)',
        callFirst: !!call && !!wa && (call.compareDocumentPosition(wa) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
        bandPrimaryCall: (() => {
          const c = document.querySelector('.contact a[href^="tel:"]');
          const w = document.querySelector('.contact a[href^="https://wa.me/"]');
          return !!c && !!w && bg(c) !== 'rgba(0, 0, 0, 0)' && bg(w) === 'rgba(0, 0, 0, 0)' && (c.compareDocumentPosition(w) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
        })(),
      };
    });
    record(path, width, 'Recoveries 24/7 is a visible badge beside the H1 (14px+)', r.badgeText === 'Recoveries 24/7' && r.badgeShown && r.badgeSize >= 14 && r.badgeGap !== null && r.badgeGap <= 48 && !r.badgeInHours, `text=${r.badgeText} size=${r.badgeSize} gap=${r.badgeGap && Math.round(r.badgeGap)}`);
    record(path, width, 'Recoveries hero: Call is the filled primary and comes first, WhatsApp is the ghost second', r.primaryCall && r.callFirst, `primaryCall=${r.primaryCall} callFirst=${r.callFirst}`);
    record(path, width, 'Recoveries closing band: Call filled and first, WhatsApp ghost', r.bandPrimaryCall, `bandPrimaryCall=${r.bandPrimaryCall}`);
    // Stacked widths (860px and below since phase 2; it was below 1100px): the actions come before the facts.
    if (width <= 860) {
      record(path, width, 'Recoveries actions sit above the facts and the country plates', r.actions !== null && r.facts !== null && r.chips !== null && r.actions < r.facts && r.actions < r.chips, `actions=${Math.round(r.actions)} facts=${Math.round(r.facts)} chips=${Math.round(r.chips)}`);
    }
  }
  if (path === '/services/repairs/' && width >= 1100) {
    const c = await page.evaluate(() => {
      const hs = [...document.querySelectorAll('.svc-cols h2')].map((h) => h.getBoundingClientRect().top);
      const h1 = parseFloat(getComputedStyle(document.querySelector('h1')).fontSize);
      const h2 = document.querySelector('.svc-cols h2') ? parseFloat(getComputedStyle(document.querySelector('.svc-cols h2')).fontSize) : 0;
      const hero = document.querySelector('.hero').getBoundingClientRect().bottom;
      return { n: hs.length, aligned: hs.length > 0 && Math.max(...hs) - Math.min(...hs) < 4, h1, h2, below: hs.length > 0 && Math.min(...hs) >= hero - 1 };
    });
    record(path, width, 'Repairs sub-headings are three columns under the hero, smaller than the H1', c.n === 3 && c.aligned && c.below && c.h2 < c.h1 * 0.6, `n=${c.n} aligned=${c.aligned} below=${c.below} h1=${c.h1} h2=${c.h2}`);
  }
  if (path === '/services/lift-kits/') {
    const l = await page.evaluate(() => {
      const a = document.querySelector('#lift-kit a.btn-primary[href^="https://wa.me/27833349357"]');
      const specs = document.querySelector('#lift-kit dl.specs');
      if (!a || !specs) return null;
      return { h: a.getBoundingClientRect().height, below: a.getBoundingClientRect().top >= specs.getBoundingClientRect().bottom - 1, n: document.querySelectorAll('#lift-kit .btn-primary').length };
    });
    record(path, width, 'lift kit price block ends in one primary CTA, 44px+', !!l && l.h >= 44 && l.below && l.n === 1, l ? `h=${l.h} below=${l.below} n=${l.n}` : 'no primary wa.me button in #lift-kit');
  }
  if (path === NEUTRAL_PAGE) {
    const order = await page.evaluate(() => [...document.querySelectorAll('main > header, main > section')].map((s) => s.id || s.tagName.toLowerCase()));
    record(path, width, 'Caravan page order: hero, pricing, inspection report, process, FAQ', JSON.stringify(order.slice(0, 5)) === JSON.stringify(['header', 'pricing', 'inspection-report', 'process', 'faq']), order.join(' > '));
    const pk = await page.evaluate(() => ({ active: document.querySelectorAll('.price.active').length, pkg: document.querySelectorAll('[data-package]').length, label: getComputedStyle(document.querySelector('.estimator'), '::before').content }));
    record(path, width, 'package rows are static (no active highlight) and the estimator label has no "v.1"', pk.active === 0 && pk.pkg === 0 && !/v\.1/.test(pk.label), `active=${pk.active} data-package=${pk.pkg} label=${pk.label}`);
    // Phase 2: the step markers are the Home page's large numerals, drawn from a CSS counter on each step (they
    // were five round .step-dot elements). Same facts: five markers, one style, one column on phones.
    const proc = await page.evaluate(() => {
      const steps = [...document.querySelectorAll('#process ol.steps > li')];
      const marks = steps.map((li) => {
        const cs = getComputedStyle(li, '::before');
        return `${cs.content}|${cs.color}|${cs.fontFamily}|${cs.fontSize}`;
      });
      const cols = new Set(steps.map((li) => Math.round(li.getBoundingClientRect().left))).size;
      return { styles: new Set(marks).size, n: steps.length, cols, numbered: marks.length > 0 && marks.every((m) => /^counter\(/.test(m)) };
    });
    record(path, width, 'process markers share one style' + (width <= 700 ? ' and stack in one column' : ''), proc.n === 5 && proc.numbered && proc.styles === 1 && (width > 700 || proc.cols === 1), `n=${proc.n} numbered=${proc.numbered} styles=${proc.styles} cols=${proc.cols}`);
    if (width <= 700) {
      // The principle tiles were replaced by two short paragraphs; the summary block itself must stay compact on a phone.
      // A missing block fails (height 0 is not "compact").
      const pts = await page.evaluate(() => {
        const e = document.querySelector('.inspection-summary')?.getBoundingClientRect();
        return { summary: e?.height ?? 0 };
      });
      record(path, width, 'inspection summary is compact on phones (present, under 480px tall)', pts.summary > 0 && (width >= 390 ? pts.summary < 480 : true), `summary=${Math.round(pts.summary)}px`);
    }
  }
  if (isFind) {
    const f = await page.evaluate(() => {
      const dir = document.querySelector('.hero-actions a[href*="maps.google.com"]');
      const fb = document.querySelector('.map-bar a[href*="maps.google.com"]');
      return { dir: dir?.textContent.trim() ?? null, dirH: dir?.getBoundingClientRect().height ?? 0, fbText: fb?.textContent.trim() ?? null, fbBtn: !!fb?.classList.contains('btn-primary'), fbH: fb?.getBoundingClientRect().height ?? 0 };
    });
    record(path, width, 'Find us hero has a "Get directions" button; the map frame carries a primary "Open in Google Maps" (44px+)', f.dir === 'Get directions' && f.dirH >= 44 && f.fbBtn && f.fbText === 'Open in Google Maps' && f.fbH >= 44, `dir=${f.dir} ${f.dirH}px mapBar=${f.fbText} primary=${f.fbBtn} ${f.fbH}px`);
  }
  if (service) {
    const loc = await page.evaluate(() => {
      // Phase 2: the location facts are a ruled list in the closing band (.band-loc); it was a .loc-card.
      const b = document.querySelector('.band-loc > a.btn');
      const c = b?.parentElement;
      if (!b || !c) return null;
      return { w: b.getBoundingClientRect().width, cw: c.getBoundingClientRect().width, text: b.textContent.trim() };
    });
    record(path, width, 'closing band "Find us" button is not stretched', !!loc && loc.text === 'Find us' && loc.w < loc.cw * 0.6, loc ? `button ${Math.round(loc.w)}px in ${Math.round(loc.cw)}px column` : 'no .band-loc > a.btn');
  }
}

// Post-launch remediation (2026-11-08). Hard-coded oracles: the recovery topbar copy, the recovery chip row,
// the readability floors and the caravan page's jump links and booking row.
const RECOVERY_TOPBAR = 'Recoveries 24/7 · Call 083 334 9357';
const RECOVERY_CHIPS = [
  ['Call', 'tel:+27833349357'],
  ['WhatsApp', `${WA_PREFIX}?text=`],
  ['What to send', '#what-to-send'],
  ['Service area', '#service-area'],
];
// Explanatory copy: 16px floor. Interactive or decision metadata: 14px floor.
const BODY_16 = ['.hero .lede', '.board-need', '.board-notes p', '.rec-grid p', '.find-lede', '.step p', '#inspection-report .rep-finding p', '.estimator > p', '.faq-a p', '.svc-includes li', '.review-body', '.how-steps p', '.checklist li', '.hero-safety', '.inspection-summary p', '.loc-text p', '.book-row p', '.svc-body li', '.svc-body p', '.hero-lede', '.contact-main p', '.contact-aside'];
// Short uppercase labels (not sentences): 13px floor.
const LABEL_13 = ['.hero-tag-k', '.hero-tag-f', '.plates span', '.rep-state', '.rep-sub', '.rep-status', '.est-label', '.est-total-label', '.hero-facts dt', '.band .find-facts dt', '.foot-heading', '.specs dt', '.hero-cap'];
// Phase 2 (2026-11-14) renames, same floors: .svc-foot -> #related .board-price, .fact dd -> .hero-facts dd,
// .loc-v small -> .find-facts dd small, .promo-price .unit -> .kit-price .unit. The Caravan page's report text
// (.report-copy span, now #inspection-report .rep-finding p) keeps its 16px floor above; the Home report's
// .rep-finding p keeps its 14px floor here.
const META_14 = ['.board-price', '.rep-finding p', '.hero-tag-p', '.find-facts dt', '.find-facts dd', '.picks span', '.compose-label', '.bar a', '.est-opt', '.est-chk', '.est-chk-price', '.est-total-note', '#related .board-price', '.review-meta', '.review-date', '.crumbs', '.mobile-quicknav a', '.nav-links a', '.hero-trust-item a', '.profile-link', '.price .amt sub', '.topbar', '.hero-facts dd', '.find-facts dd small', '.kit-price .unit', '.page-nav a', '.map-bar-addr span', '.hero-proof a', '.specs dd', '.loc-photo figcaption', '.loc-services a', '.hrs span'];

async function remediationChecks(page, path, width) {
  const floors = await page.evaluate(({ body, meta, label }) => {
    const bad = [];
    // Measure FAQ answers too: open every <details> for the scan, then put each back as it was.
    const closed = [...document.querySelectorAll('details:not([open])')];
    closed.forEach((d) => (d.open = true));
    let seen = 0;
    const matched = {};
    const scan = (sels, min) => {
      for (const sel of sels) {
        matched[sel] = document.querySelectorAll(sel).length;
        for (const el of document.querySelectorAll(sel)) {
          if (!el.checkVisibility || !el.checkVisibility()) continue;
          seen++;
          const px = parseFloat(getComputedStyle(el).fontSize);
          if (px < min - 0.01) bad.push(`${sel}=${px}px (<${min})`);
        }
      }
    };
    scan(body, 16);
    scan(meta, 14);
    scan(label, 13);
    closed.forEach((d) => (d.open = false));
    return { bad: [...new Set(bad)], seen, matched };
  }, { body: BODY_16, meta: META_14, label: LABEL_13 });
  for (const [sel, n] of Object.entries(floors.matched)) floorMatches.set(sel, (floorMatches.get(sel) ?? 0) + n);
  // seen > 20: every page has far more than 20 matching elements, so an empty selector list cannot pass.
  record(path, width, 'readability floors: explanatory copy 16px+, decision metadata 14px+, labels 13px+', floors.bad.length === 0 && floors.seen > 20, floors.bad.slice(0, 6).join(' ') || `${floors.seen} elements measured`);

  if (path === '/services/recoveries/') {
    const t = await page.evaluate(() => {
      const bar = document.querySelector('.topbar');
      const a = bar?.querySelector('a.topbar-call');
      return {
        text: bar?.textContent.replace(/\s+/g, ' ').trim() ?? null,
        href: a?.getAttribute('href') ?? null,
        h: a?.getBoundingClientRect().height ?? 0,
        track: !!bar?.querySelector('.topbar-track'),
      };
    });
    record(path, width, 'recovery topbar says 24/7 and dials the number (no workshop hours, no ticker)', t.text === RECOVERY_TOPBAR && t.href === 'tel:+27833349357' && t.h >= 44 && !t.track, `text=${t.text} href=${t.href} h=${Math.round(t.h)} ticker=${t.track}`);

    // Header: on this page the Call button is the filled primary pill, WhatsApp the outlined second.
    const h = await page.evaluate(() => {
      const call = document.querySelector('.nav a.nav-call');
      const wa = document.querySelector('.nav a.nav-cta');
      const bg = (el) => getComputedStyle(el).backgroundColor;
      return call && wa ? { callFilled: bg(call) !== 'rgba(0, 0, 0, 0)', waFilled: bg(wa) !== 'rgba(0, 0, 0, 0)', callFirst: call.getBoundingClientRect().right <= wa.getBoundingClientRect().left + 1, callText: call.textContent.trim(), phoneShown: !!document.querySelector('.nav .nav-phone') } : null;
    });
    record(path, width, 'recovery header: filled Call first, WhatsApp outlined second', !!h && h.callFilled && !h.waFilled && h.callFirst && h.callText === 'Call' && !h.phoneShown, JSON.stringify(h));

    const chips = await page.evaluate(() => [...document.querySelectorAll('.mobile-quicknav a')].map((a) => [a.textContent.trim(), a.getAttribute('href')]));
    const chipsOk = chips.length === RECOVERY_CHIPS.length && RECOVERY_CHIPS.every(([label, href], i) => chips[i][0] === label && chips[i][1].startsWith(href));
    const targets = await page.evaluate(() => ['#what-to-send', '#service-area'].every((id) => !!document.querySelector(id)));
    record(path, width, 'recovery chip row: Call, WhatsApp, What to send, Service area (no Shop, no Pricing)', chipsOk && targets, chips.map((c) => c[0]).join(' | '));

    // Above the fold: no workshop hours and no "Closed" anywhere a stranded visitor looks first.
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    const fold = await page.evaluate(() => {
      const hits = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const el = n.parentElement;
        if (!el || !el.checkVisibility || !el.checkVisibility()) continue;
        if (!/\d\d:\d\d|closed/i.test(n.textContent)) continue;
        const r = el.getBoundingClientRect();
        if (r.bottom > 0 && r.top < window.innerHeight) hits.push(n.textContent.trim().slice(0, 40));
      }
      return hits;
    });
    record(path, width, 'recovery first screen shows no workshop hours or "Closed"', fold.length === 0, fold.join(' | '));

    const order = await page.evaluate(() => {
      const top = (s) => document.querySelector(s)?.getBoundingClientRect().top ?? null;
      return { actions: top('.hero-actions'), safety: top('.hero-safety'), lede: top('.hero-lede'), list: top('#what-to-send'), facts: top('#service-area'), safetyText: document.querySelector('.hero-safety')?.textContent.trim() ?? '' };
    });
    // Phase 2: what to send sits above the service area at every width (it was only required below 1100px).
    const orderOk = order.actions !== null && order.safety !== null && order.list !== null && order.facts !== null && order.actions < order.safety && order.safety < order.lede && order.list < order.facts && /emergency services first/.test(order.safetyText);
    record(path, width, 'recovery order: Call/WhatsApp, safety line, lede; what to send before the service area', orderOk, JSON.stringify(order).slice(0, 160));

    // Phase 2: the band's labels are the terms of its ruled list (they were .loc-k labels in a card).
    const band = await page.evaluate(() => [...document.querySelectorAll('.contact .find-facts dt')].map((e) => e.textContent.trim()));
    record(path, width, 'recovery closing band labels "Workshop hours" and "Recoveries 24/7" separately', band.includes('Workshop hours') && band.includes('Recoveries 24/7'), band.join(' | '));
  }

  if (path !== '/services/recoveries/') {
    const plain = await page.evaluate(() => ({ track: !!document.querySelector('.topbar .topbar-track'), call: !!document.querySelector('.topbar-call') }));
    record(path, width, 'workshop top line is the hours line, not the recovery call line', plain.track && !plain.call, JSON.stringify(plain));

    // The number in the top line: an underlined tel: link above 860px; at 860px and below plain text that reads
    // the same (a line of text 17px high is no tap target, and the fixed bar carries Call there). The number is
    // a hard-coded oracle. The plain text is drawn from an attribute, so its drawn content is what is read.
    const num = await page.evaluate(() => {
      const link = document.querySelector('.topbar a[href="tel:+27833349357"]');
      const text = document.querySelector('.topbar .topbar-tel-text');
      const shown = (el) => !!el && el.checkVisibility() && el.getBoundingClientRect().width > 0;
      return {
        link: shown(link) ? link.textContent.trim() : null,
        underlined: !!link && getComputedStyle(link).textDecorationLine.includes('underline'),
        text: shown(text) ? getComputedStyle(text, '::after').content.replace(/^"|"$/g, '') : null,
        links: [...document.querySelectorAll('.topbar a')].filter(shown).length,
        underlinedAll: [...document.querySelectorAll('.topbar a')].filter(shown).every((a) => getComputedStyle(a).textDecorationLine.includes('underline')),
      };
    });
    const numOk = width <= 860 ? num.link === null && num.text === '083 334 9357' && num.links === 0 : num.link === '083 334 9357' && num.text === null && num.underlined && num.links >= 2 && num.underlinedAll;
    record(path, width, width <= 860 ? 'top line number is plain text at 860px and below (no link in the top line)' : 'top line number and address are underlined links above 860px', numOk, `link=${num.link} plain text=${num.text} visible links=${num.links} underlined=${num.underlinedAll}`);
  }

  if (path === NEUTRAL_PAGE) {
    const nav = await page.evaluate(() => {
      const links = [...document.querySelectorAll('nav.page-nav a')].map((a) => a.getAttribute('href'));
      const est = document.querySelector('.estimator')?.getBoundingClientRect();
      const book = document.querySelector('#pricing .book-row a[href^="https://wa.me/27833349357"]')?.getBoundingClientRect();
      const nav = document.querySelector('nav.page-nav');
      return { links, ok: links.every((h) => !!document.querySelector(h)), sticky: nav ? getComputedStyle(nav).position : null, bookAfter: !!est && !!book && book.top >= est.bottom - 1, bookH: book?.height ?? 0 };
    });
    record(path, width, 'caravan jump links: Prices, Included, Report, Book, all targets exist, not sticky', JSON.stringify(nav.links) === JSON.stringify(['#pricing', '#included', '#inspection-report', '#contact']) && nav.ok && nav.sticky === 'static', JSON.stringify(nav.links));
    record(path, width, 'caravan booking CTA sits after the estimator (44px+)', nav.bookAfter && nav.bookH >= 44, `after=${nav.bookAfter} h=${nav.bookH}`);
  }

  if (path === '/services/solar-electrical/') {
    // One related service: no card band stranded in an empty row; a sentence in the closing band links it instead.
    const one = await page.evaluate(() => {
      const a = document.querySelector('main > section:last-of-type .contact-related a[href="/services/repairs/"]');
      return { band: !!document.querySelector('#related'), link: a?.textContent.trim() ?? null };
    });
    record(path, width, 'a lone related service is a text link in the closing band, not a card grid', !one.band && one.link === 'caravan repairs', JSON.stringify(one));
  }
}

// Phase 2 (2026-11-14): the service pages, Find us and the 404 page in the Home page's system. Colours are
// hard-coded oracles (ink #0e0f11, paper #ebe6dd, the highlight #ff7a3b, the grounds #f3f3f0 and #e7e7e2).
const INK = 'rgb(14, 15, 17)';
const PAPER = 'rgb(235, 230, 221)';
const HILITE = 'rgb(255, 122, 59)';
const GROUND = 'rgb(243, 243, 240)';
const GROUND_2 = 'rgb(231, 231, 226)';
const NO_HERO_PHOTO = '/services/recoveries/';

// The hero: the ink field, the headline in paper with one highlighted line, and that highlight used once per page.
async function inkHeroRow(page, path, width) {
  const h = await page.evaluate(() => {
    const hero = document.querySelector('main > header.hero');
    const h1 = hero?.querySelector('h1');
    const hi = h1?.querySelector('.hi');
    if (!hero || !h1 || !hi) return null;
    return { bg: getComputedStyle(hero).backgroundColor, h1: getComputedStyle(h1).color, hi: getComputedStyle(hi).color, hiCount: document.querySelectorAll('main .hi').length, font: getComputedStyle(h1).fontFamily, hiBelow: hi.getBoundingClientRect().top > h1.getBoundingClientRect().top + 4 };
  });
  record(path, width, 'hero is the ink field: paper headline, one highlighted line, highlight used once', !!h && h.bg === INK && h.h1 === PAPER && h.hi === HILITE && h.hiCount === 1 && /bebas/i.test(h.font) && h.hiBelow, h ? `bg=${h.bg} h1=${h.h1} hi=${h.hi} x${h.hiCount} second line below=${h.hiBelow}` : 'no main > header.hero with an h1 and a .hi line');
}

// FAQ accordion: a question row opens and closes, the plus and minus follow, and aria-expanded stays in sync.
// The first and the last question are exercised; each is left closed, as it was found.
async function faqRow(page, path, width) {
  const items = await page.$$('details.faq-item');
  if (items.length === 0) {
    record(path, width, 'FAQ rows open and close with aria-expanded in sync', false, 'no details.faq-item on this page');
    return;
  }
  const state = (d) =>
    d.evaluate((el) => {
      const s = el.querySelector('summary');
      const vis = (sel) => !!s.querySelector(sel)?.checkVisibility();
      return { open: el.open, aria: s.getAttribute('aria-expanded'), plus: vis('.faq-toggle svg:first-child'), minus: vis('.faq-toggle svg:last-child'), answer: !!el.querySelector('.faq-a')?.checkVisibility() };
    });
  const settled = (d, want) => page.waitForFunction(([el, w]) => el.querySelector('summary').getAttribute('aria-expanded') === w, [d, want], { timeout: 2000 }).then(() => true, () => false);
  const isClosed = (s) => !s.open && s.aria === 'false' && s.plus && !s.minus && !s.answer;
  const isOpen = (s) => s.open && s.aria === 'true' && !s.plus && s.minus && s.answer;
  const bad = [];
  for (const [name, d] of [['first', items[0]], ['last', items[items.length - 1]]]) {
    const summary = await d.$('summary');
    const s0 = await state(d);
    await summary.click();
    await settled(d, 'true');
    const s1 = await state(d);
    await summary.click();
    await settled(d, 'false');
    const s2 = await state(d);
    if (!isClosed(s0)) bad.push(`${name} at rest ${JSON.stringify(s0)}`);
    if (!isOpen(s1)) bad.push(`${name} after one click ${JSON.stringify(s1)}`);
    if (!isClosed(s2)) bad.push(`${name} after two clicks ${JSON.stringify(s2)}`);
  }
  record(path, width, 'FAQ rows open and close with aria-expanded in sync', bad.length === 0, bad.length ? bad.slice(0, 2).join('; ').slice(0, 300) : `${items.length} rows; first and last opened and closed`);
}

async function pageSystemChecks(page, path, width) {
  await inkHeroRow(page, path, width);

  // The hero photo has loaded and is drawn; above 860px it runs to the right edge of the screen.
  if (path !== NO_HERO_PHOTO) {
    const p = await page.evaluate(async () => {
      const img = document.querySelector('.hero .hero-photo img');
      if (!img) return null;
      if (!img.complete) await new Promise((res) => { img.addEventListener('load', res, { once: true }); img.addEventListener('error', res, { once: true }); setTimeout(res, 5000); });
      const r = img.getBoundingClientRect();
      return { loaded: img.complete && img.naturalWidth > 0, shown: img.checkVisibility(), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right), iw: window.innerWidth, src: (img.currentSrc || '').split('/').pop() };
    });
    record(path, width, 'hero photo loads and is drawn' + (width > 860 ? ', bleeding to the right edge' : ''), !!p && p.loaded && p.shown && p.w >= 200 && p.h >= 200 && (width <= 860 || p.right >= p.iw - 1), p ? `${p.src} ${p.w}x${p.h} loaded=${p.loaded} right=${p.right}/${p.iw}` : 'no .hero .hero-photo img');
  } else {
    const pl = await page.evaluate(() => [...document.querySelectorAll('.hero .plates li')].filter((li) => li.checkVisibility() && li.getBoundingClientRect().width > 40).map((li) => li.querySelector('b')?.textContent.trim()));
    record(path, width, 'Recoveries hero shows the five country plates', JSON.stringify(pl) === JSON.stringify(['BW', 'MZ', 'ZW', 'NA', 'SZ']), pl.join(' ') || 'no visible .hero .plates li');
  }

  // Working sections alternate the two daylight grounds, and the page ends on the ink closing band.
  const grounds = await page.evaluate(() => [...document.querySelectorAll('main > section')].map((s) => getComputedStyle(s).backgroundColor));
  const named = grounds.map((g) => (g === 'rgba(0, 0, 0, 0)' || g === GROUND ? 'ground' : g === GROUND_2 ? 'ground-2' : g === INK ? 'ink' : g));
  const working = named.slice(0, -1);
  const alternates = working.length > 0 && working[0] === 'ground' && working.every((g, i) => g === (i % 2 === 0 ? 'ground' : 'ground-2'));
  record(path, width, 'sections alternate the daylight grounds and end on the ink band', alternates && named.at(-1) === 'ink', named.join(' > '));

  // No pill shapes and no old rounded cards: every corner radius in <main> is 6px or less.
  const radius = await page.evaluate(() => {
    const bad = [];
    let rounded = 0;
    for (const el of document.querySelectorAll('main *')) {
      if (!el.checkVisibility()) continue;
      const cs = getComputedStyle(el);
      const corners = [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius];
      if (corners.some((c) => parseFloat(c) > 0)) rounded++;
      if (corners.some((c) => parseFloat(c) > 6 || (c.includes('%') && parseFloat(c) > 0))) bad.push(`${el.tagName.toLowerCase()}.${String(el.className.baseVal ?? el.className).split(' ')[0]}=${corners[0]}`);
    }
    return { bad: [...new Set(bad)], rounded };
  });
  record(path, width, 'no pill shapes: every corner radius in main is 6px or less', radius.bad.length === 0 && radius.rounded >= 3, radius.bad.length ? radius.bad.slice(0, 4).join(' ') : `${radius.rounded} rounded elements, all 6px or less`);

  await faqRow(page, path, width);

  // Related services: board rows, each one a 44px+ link (Solar has one related service: a sentence in the band).
  if (path.startsWith('/services/') && path !== '/services/solar-electrical/') {
    const rel = await page.evaluate(() => {
      const board = document.querySelector('#related .board');
      const rows = [...document.querySelectorAll('#related a.board-row')];
      return { topRule: board ? parseFloat(getComputedStyle(board).borderTopWidth) : 0, n: rows.length, minH: rows.length ? Math.min(...rows.map((a) => a.getBoundingClientRect().height)) : 0, shown: rows.every((a) => a.checkVisibility()) };
    });
    record(path, width, 'related services are ruled board rows, 44px+', rel.n >= 2 && rel.topRule === 3 && rel.minH >= 44 && rel.shown, `rows=${rel.n} top rule=${rel.topRule}px minH=${Math.round(rel.minH)}`);
  }
}

// Shift+Tab from the bottom: every stop must sit below the sticky header (WCAG 2.4.11). The visible header is the
// brand row plus the chip row while the chip row is shown (a Tab press brings it back).
async function backwardFocusCheck(page, path, width) {
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
  // The click puts the Tab starting point at the foot of the page. If it fails, the walk below would start
  // somewhere else and prove nothing, so the row fails and says why.
  const clicked = await page.locator('footer').last().click({ position: { x: 1, y: 1 }, timeout: 5000 }).then(() => null, (e) => String(e?.message ?? e).split('\n')[0]);
  if (clicked !== null) {
    record(path, width, 'Shift+Tab: no focused element hidden under the sticky header', false, `could not click the footer to start from the bottom: ${clicked}`);
    return;
  }
  const hidden = [];
  let stops = 0;
  for (let i = 0; i < 24; i++) {
    await page.keyboard.press('Shift+Tab');
    await page.waitForTimeout(220);
    const s = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      if (el.closest('.nav, .topbar') || getComputedStyle(el).position === 'fixed' || el.tagName === 'IFRAME') return { skip: true };
      const r0 = el.getBoundingClientRect();
      // The skip link is drawn over the header on focus by design: it passes when it is the element on top.
      if (el.matches('a[href="#main"]')) {
        const hit = document.elementFromPoint(r0.left + r0.width / 2, r0.top + r0.height / 2);
        return { skip: false, ok: hit === el || el.contains(hit), what: `skip link covered by ${hit?.className}` };
      }
      const nav = document.querySelector('.nav').getBoundingClientRect();
      const row = document.querySelector('.mobile-quicknav');
      const rowShown = row && getComputedStyle(row).display !== 'none' && Number(getComputedStyle(row).opacity) > 0.5;
      const headerBottom = rowShown ? Math.max(nav.bottom, row.getBoundingClientRect().bottom) : nav.bottom;
      const r = el.getBoundingClientRect();
      return { skip: false, ok: r.top >= headerBottom - 1, what: `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} "${el.textContent.trim().slice(0, 24)}" top=${Math.round(r.top)} header=${Math.round(headerBottom)}` };
    });
    if (!s) break;
    if (s.skip) continue;
    stops++;
    if (!s.ok) hidden.push(s.what);
  }
  record(path, width, 'Shift+Tab: no focused element hidden under the sticky header', stops > 5 && hidden.length === 0, hidden.length ? hidden.slice(0, 3).join('; ') : `${stops} stops`);
}

// Tab from the top, the mirror of the Shift+Tab row: at 860px and below every stop must sit above the fixed
// WhatsApp and Call bar (WCAG 2.4.11). The same walk measures the focus ring against the surface it is drawn on
// (WCAG 1.4.11, 3:1). The surface is the stack of background-colors up the ancestor chain, as in the orange text
// row: exact on flat surfaces; background images are not modelled.
async function forwardFocusCheck(page, path, width) {
  await page.evaluate(() => {
    // Start the Tab order at the top of the page (see quicknavTabReach).
    const skip = document.querySelector('a.sr-only');
    skip?.focus();
    skip?.blur();
    window.scrollTo(0, 0);
    window.__walked = new WeakSet();
  });
  const hidden = [];
  const faint = [];
  const ringless = [];
  let stops = 0;
  let rings = 0;
  let bar = null;
  let ended = false; // the walk came back to an element it had visited: every stop was seen
  for (let i = 0; i < TAB_BUDGET; i++) {
    await page.keyboard.press('Tab');
    await page.waitForTimeout(120);
    const s = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body || window.__walked.has(el)) return null;
      window.__walked.add(el);
      const b = document.querySelector('body > .bar');
      const barState = !b ? 'missing' : b.checkVisibility() ? 'shown' : 'hidden';
      // A cross-origin iframe (the Maps embed) never matches :focus-visible here; its frame's ring has its own row.
      if (el.tagName === 'IFRAME') return { skip: true, barState };
      const what = `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} "${(el.textContent.trim() || el.getAttribute('name') || '').slice(0, 24)}"`;
      const r = el.getBoundingClientRect();
      const barTop = barState === 'shown' ? b.getBoundingClientRect().top : null;
      // The bar's own two links are the bar: they cannot sit under it. Their rings are measured like any other.
      const out = { skip: false, barState, clear: !!el.closest('.bar') || barTop === null || r.bottom <= barTop + 1, what: `${what} bottom=${Math.round(r.bottom)} bar=${barTop === null ? 'n/a' : Math.round(barTop)}` };

      // Focus ring: there must be one, and it must stand out from what it is drawn on.
      const ring = window.__focusRing(el);
      if (!ring.drawn) return { ...out, noRing: what };
      const ringEl = ring.on;
      const cs = ring.cs;
      const parse = (c) => {
        const m = c.match(/rgba?\(([^)]+)\)/);
        if (!m) return null;
        const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
        return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
      };
      const lum = ({ r, g, b }) => {
        const f = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const over = (top, bottom) => ({ r: top.r * top.a + bottom.r * (1 - top.a), g: top.g * top.a + bottom.g * (1 - top.a), b: top.b * top.a + bottom.b * (1 - top.a), a: 1 });
      const backdrop = (from) => {
        const layers = [];
        for (let n = from; n; n = n.parentElement) {
          const c = parse(getComputedStyle(n).backgroundColor);
          if (c && c.a > 0) layers.push(c);
        }
        return layers.reduceRight((acc, c) => over(c, acc), { r: 255, g: 255, b: 255, a: 1 });
      };
      const fg = parse(cs.outlineColor);
      // A ring drawn inside the element (negative offset) sits on the element itself, otherwise on what is around it.
      // An element taken out of the page and pinned over it (the skip link, fixed over the header while focused) is
      // not drawn on its parent: its surface is whatever lies under the ring, found by hit-testing a point on it.
      let surface = parseFloat(cs.outlineOffset) < 0 ? ringEl : ringEl.parentElement;
      if (parseFloat(cs.outlineOffset) >= 0 && cs.position === 'fixed' && !ringEl.closest('.bar')) {
        const rr = ringEl.getBoundingClientRect();
        const reach = parseFloat(cs.outlineOffset) + parseFloat(cs.outlineWidth) / 2;
        const under = document.elementsFromPoint(rr.right + reach, rr.top + rr.height / 2).find((n) => n !== ringEl && !ringEl.contains(n));
        if (under) surface = under;
      }
      const bg = backdrop(surface);
      if (!fg) return { ...out, noRing: `${what} (outline colour ${cs.outlineColor} cannot be read)` };
      const ratio = (Math.max(lum(fg), lum(bg)) + 0.05) / (Math.min(lum(fg), lum(bg)) + 0.05);
      return { ...out, ratio, ring: `${what} ${ratio.toFixed(2)}:1 on rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})` };
    });
    if (!s) {
      ended = true;
      break;
    }
    bar = s.barState;
    if (s.skip) continue;
    stops++;
    if (!s.clear) hidden.push(s.what);
    if (s.noRing) ringless.push(s.noRing);
    if (s.ratio !== undefined) {
      rings++;
      if (s.ratio < 3) faint.push(s.ring);
    }
  }
  if (width <= 860) {
    record(path, width, 'Tab: no focused element hidden under the fixed bar', bar === 'shown' && stops > 5 && hidden.length === 0, bar !== 'shown' ? `fixed bar ${bar ?? 'never reached'}` : hidden.length ? `${hidden.length} of ${stops} stops: ${hidden.slice(0, 3).join('; ')}` : `${stops} stops`);
  }
  // Every stop of the whole page is walked (to the point where focus wraps round), and every one must draw a ring.
  record(path, width, 'every Tab stop on the page shows a focus ring', ended && stops > 5 && ringless.length === 0, !ended ? `the walk did not come back round within ${TAB_BUDGET} Tab presses (${stops} stops seen)` : ringless.length ? `${ringless.length} of ${stops} stops without a ring: ${ringless.slice(0, 3).join('; ')}` : `${stops} stops, all with a ring`);
  record(path, width, 'focus ring contrast >= 3:1 on the surface it is drawn on', rings > 5 && rings === stops - ringless.length && faint.length === 0, faint.length ? `${faint.length} of ${rings} rings: ${[...new Set(faint)].slice(0, 3).join('; ')}` : `${rings} rings measured of ${stops} stops`);
}

const browser = await chromium.launch({ executablePath: EXECUTABLE });

for (const path of PAGES) {
  for (const width of WIDTHS) await guarded(path, width, { viewport: { width, height: 900 } }, async (page, context) => {
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

    const res = await visit(page, BASE + path, 'networkidle', path, width);
    if (!res) return;
    record(path, width, 'status 200', res.status() === 200, String(res.status()));

    // The web fonts have arrived. document.fonts.check() cannot tell (it answers true for a family the page never
    // declared), so the loaded faces themselves are read.
    const fonts = await page.evaluate(async (want) => {
      await document.fonts.ready;
      const loaded = [...document.fonts].filter((f) => f.status === 'loaded').map((f) => `${f.family.replace(/["']/g, '')} ${f.weight}`);
      return { missing: want.map(([family, weight]) => `${family} ${weight}`).filter((f) => !loaded.includes(f)), checks: want.every(([family, weight]) => document.fonts.check(`${weight} 16px "${family}"`)) };
    }, WEB_FONTS);
    record(path, width, 'web fonts loaded (Bebas Neue 400, Barlow 400, 600 and 700)', fonts.missing.length === 0 && fonts.checks, fonts.missing.length ? `not loaded: ${fonts.missing.join(', ')}` : `${WEB_FONTS.length} faces loaded`);

    await overflowRow(page, path, width);

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
    // Zero bytes is not a light page: it means the counter saw no response at all.
    record(path, width, 'weight < 250 KB', weight > 0 && weight < WEIGHT_LIMIT, `${(weight / 1024).toFixed(1)} KB`);

    // Tab walk: every stop of the page, until focus comes back to one already visited (or leaves the page).
    let walkOk = true;
    let walkDetail = '';
    let stops = 0;
    let wrapped = false;
    await page.evaluate(() => { window.__tabbed = new WeakSet(); });
    for (let i = 0; i < TAB_BUDGET; i++) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body || window.__tabbed.has(el)) return { body: true };
        window.__tabbed.add(el);
        return {
          body: false,
          tag: el.tagName.toLowerCase(),
          cls: el.className && el.className.toString().slice(0, 30),
          ring: window.__focusRing(el).drawn,
        };
      });
      if (info.body) {
        wrapped = true;
        break;
      }
      stops++;
      // A cross-origin iframe (the Maps embed) never matches :focus-visible in the parent document, so its own
      // outline cannot be asserted here. It stays in the Tab order (checked below); only the ring test skips it.
      if (info.tag === 'iframe') continue;
      if (!info.ring) {
        walkOk = false;
        walkDetail = `no focus ring drawn for <${info.tag} class="${info.cls}"> at stop ${stops}`;
        break;
      }
    }
    if (walkOk && !wrapped) {
      walkOk = false;
      walkDetail = `the walk did not come back round within ${TAB_BUDGET} Tab presses`;
    }
    if (stops < 1) {
      walkOk = false;
      walkDetail = 'tab walk reached 0 focusable stops';
    }
    const trapped = await page.evaluate(() => [...document.querySelectorAll('iframe[tabindex="-1"]')].length);
    record(path, width, 'iframes stay keyboard reachable (no tabindex -1)', trapped === 0, `${trapped} iframe(s) removed from the Tab order`);
    record(path, width, 'tab walk shows focus ring', walkOk, walkOk ? `${stops} stops` : walkDetail);

    // Sticky header height: the quick-link row must not wrap to a second row on phones.
    // Measured at the top of the page: below it the quick-link row slides away on scroll down (checked separately).
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.waitForTimeout(300);
    // Header height = the brand row plus the chip row that hangs under it (when shown).
    const headerH = await page.evaluate(() => {
      const nav = document.querySelector('.nav')?.getBoundingClientRect();
      if (!nav) return -1;
      const row = document.querySelector('.mobile-quicknav');
      const rr = row && getComputedStyle(row).display !== 'none' ? row.getBoundingClientRect() : null;
      return (rr ? Math.max(nav.bottom, rr.bottom) : nav.bottom) - nav.top;
    });
    const limit = width <= 320 ? 140 : width <= 390 ? 130 : width <= 768 ? 140 : null;
    if (limit !== null) record(path, width, `sticky header <= ${limit}px`, headerH > 0 && headerH <= limit, `${Math.round(headerH)}px`);

    await quicknavRows(page, path, width);

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
    // Home carries the strip: there, a missing strip fails. Other pages have none, and get no row.
    if (orphan) record(path, width, 'trust strip has no orphan tile', !orphan.lone, `rows=${orphan.rowsCount} lastRow=${orphan.last}`);
    else if (path === '/') record(path, width, 'trust strip has no orphan tile', false, 'no .hero-trust on the Home page');

    await fixedBarRow(page, path, width);

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

    // Orange text must keep its contrast on whatever it sits on (brand orange on paper was 2.78:1).
    // The background is the stack of background-colors up the ancestor chain composited onto white. Gradients and
    // images are not modelled (their element's own background-color is used), so this is exact on flat and
    // translucent surfaces, such as the paper section, and approximate on the dark gradient hero.
    const contrast = await page.evaluate(() => {
      const parse = (s) => {
        const m = s.match(/rgba?\(([^)]+)\)/);
        if (!m) return null;
        const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
        return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
      };
      const lum = ({ r, g, b }) => {
        const f = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const over = (top, bottom) => ({
        r: top.r * top.a + bottom.r * (1 - top.a),
        g: top.g * top.a + bottom.g * (1 - top.a),
        b: top.b * top.a + bottom.b * (1 - top.a),
        a: 1,
      });
      const backdrop = (el) => {
        const layers = [];
        for (let n = el; n; n = n.parentElement) {
          const c = parse(getComputedStyle(n).backgroundColor);
          if (c && c.a > 0) layers.push(c);
        }
        return layers.reduceRight((acc, c) => over(c, acc), { r: 255, g: 255, b: 255, a: 1 });
      };
      const isOrange = (c) => c && c.a === 1 && c.r > 150 && c.r - c.b > 100 && c.r > c.g && c.g > c.b;
      let checked = 0;
      const bad = [];
      for (const el of document.querySelectorAll('body *')) {
        if (!el.checkVisibility || !el.checkVisibility()) continue;
        if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
        const cs = getComputedStyle(el);
        const fg = parse(cs.color);
        if (!isOrange(fg)) continue;
        checked++;
        const bg = backdrop(el);
        const ratio = (Math.max(lum(fg), lum(bg)) + 0.05) / (Math.min(lum(fg), lum(bg)) + 0.05);
        const px = parseFloat(cs.fontSize);
        const large = px >= 24 || (px >= 18.66 && Number(cs.fontWeight) >= 700);
        if (ratio < (large ? 3 : 4.5)) bad.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} ${ratio.toFixed(2)}:1 ${px}px`);
      }
      return { checked, bad: [...new Set(bad)] };
    });
    // Every page has orange text (the highlighted headline line at least): none found means the scan is broken.
    record(path, width, 'orange text contrast (4.5 small, 3 large)', contrast.checked >= 1 && contrast.bad.length === 0, contrast.bad.length ? contrast.bad.slice(0, 4).join('; ') : `${contrast.checked} orange text elements checked`);

    // Decorative section numbers were removed: no "§" marker may come back, hidden or not, and any .sec-num left must be aria-hidden.
    const secNums = await page.evaluate(() => ({
      exposed: [...document.querySelectorAll('.sec-num')].filter((e) => e.getAttribute('aria-hidden') !== 'true').length,
      marks: (document.querySelector('main')?.textContent ?? '').includes('\u00a7'),
    }));
    record(path, width, 'no decorative section numbers', secNums.exposed === 0 && !secNums.marks, `${secNums.exposed} exposed .sec-num, section mark in main: ${secNums.marks}`);

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

    await roundThreeChecks(page, path, width);
    await remediationChecks(page, path, width);
    if (path !== '/') await pageSystemChecks(page, path, width);

    // Footer hours: every segment is nowrap so a time never breaks mid-range.
    const hoursWrap = await page.evaluate(() => {
      const segs = [...document.querySelectorAll('.foot-hours-seg')];
      return segs.length === 0 ? 'none' : segs.every((e) => getComputedStyle(e).whiteSpace === 'nowrap') ? 'ok' : 'wrap';
    });
    record(path, width, 'footer hours segments nowrap', hoursWrap === 'ok', hoursWrap);

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: join(SHOTS_DIR, `${slug(path)}-${width}.png`), fullPage: true });
  });
}

// Country plates: the names fit inside the plates at phone widths, where the hero turns to two columns, on a small
// laptop and on a wide screen.
for (const path of PLATE_PAGES.filter((p) => PAGES.includes(p))) {
  for (const width of PLATE_WIDTHS) await guarded(path, width, { viewport: { width, height: 900 } }, async (page) => {
    if (!(await visit(page, BASE + path, 'networkidle', path, width))) return;
    await page.evaluate(() => document.fonts.ready);
    await platesRow(page, path, width);
  });
}

// No-JS pass at one phone width and one desktop width. The rows are labelled nojs (390px) and nojs-w (1440px).
const NOJS_PASSES = PAGES.flatMap((path) => [[path, 'nojs', 390], [path, 'nojs-w', 1440]]);
for (const [path, nojsRow, width] of NOJS_PASSES) await guarded(path, nojsRow, { viewport: { width, height: 900 }, javaScriptEnabled: false }, async (page) => {
  const nojs = await visit(page, BASE + path, 'load', path, nojsRow);
  if (!nojs) return;
  record(path, nojsRow, 'status 200', nojs.status() === 200, String(nojs.status()));

  // A missing header CTA is a FAIL row here, not a 30 second wait and an exception.
  const href = (await (await page.$('.nav-cta'))?.getAttribute('href')) ?? null;
  record(path, nojsRow, 'CTA href is a wa.me link', !!href && href.startsWith(WA_PREFIX), href ?? 'missing');

  const details = await page.$$('details');
  let toggled = 0;
  for (const d of details) {
    const summary = await d.$('summary');
    const before = await d.evaluate((el) => el.open);
    await summary.click();
    const after = await d.evaluate((el) => el.open);
    if (before !== after) toggled++;
  }
  const expectDetails = path.startsWith('/services/') || path === '/find-us/'; // every page with a FAQ
  if (details.length === 0 && !expectDetails) {
    record(path, nojsRow, 'every <details> toggles (n/a)', true, 'n/a: none on this page');
  } else {
    record(path, nojsRow, 'every <details> toggles', details.length > 0 && toggled === details.length, `${toggled}/${details.length}`);
  }

  if (path === NEUTRAL_PAGE) {
    // JS off: the static estimator shows, the live controls stay hidden, the CTA is the neutral enquiry.
    const stat = await page.$('.est-static');
    const live = await page.$('.est-live');
    const cta = await page.$('[data-est-cta]');
    record(path, nojsRow, 'estimator .est-static visible', !!stat && (await stat.isVisible()), stat ? '' : 'selector .est-static matches nothing');
    record(path, nojsRow, 'estimator .est-live hidden', !!live && !(await live.isVisible()), live ? '' : 'selector .est-live matches nothing');
    const href = cta ? await cta.getAttribute('href') : null;
    record(path, nojsRow, 'estimator CTA is the neutral wa.me enquiry', href === NEUTRAL_ESTIMATE_HREF, href ?? 'selector [data-est-cta] matches nothing');
  }
  if (path === '/') {
    // JS off: the message builder's choices and preview stay hidden; the Send link carries the default message.
    const live = await page.$('.compose-live');
    const send = await page.$('form[data-compose] a[data-compose-send]');
    record(path, nojsRow, 'message builder .compose-live hidden', !!live && !(await live.isVisible()), live ? '' : 'selector .compose-live matches nothing');
    const sendHref = send ? decodeURIComponent((await send.getAttribute('href')) ?? '') : null;
    record(path, nojsRow, 'message builder Send link visible with the default message', !!send && (await send.isVisible()) && sendHref === `${WA_PREFIX}?text=${COMPOSE_DEFAULT}`, sendHref ?? 'selector form[data-compose] a[data-compose-send] matches nothing');
  }
  if (nojsRow === 'nojs') {
    // Presence guard (once per page: the markup is the same at both widths): every selector the redesign added
    // must match on the page that is meant to render it.
    const want = [...REDESIGN_SELECTORS['*'], ...(REDESIGN_SELECTORS[path] ?? [])];
    const gone = await page.evaluate((sels) => sels.filter((sel) => document.querySelectorAll(sel).length === 0), want);
    record(path, 'dom', 'redesign selectors each match an element', want.length > 0 && gone.length === 0, gone.length ? `match nothing: ${gone.join(', ')}` : `${want.length} selectors matched`);
  }
  if (path === '/find-us/') {
    const m = await page.evaluate(() => {
      const a = document.querySelector('.map-bar a[href*="maps.google.com"]');
      return { href: a?.getAttribute('href') ?? null, visible: !!a && a.checkVisibility(), addr: document.querySelector('.map-bar-addr')?.textContent.replace(/\s+/g, ' ').trim() ?? '' };
    });
    record(path, nojsRow, 'map bar: address, GPS and an "Open in Google Maps" link without JavaScript', m.visible && !!m.href && /252 General Beyers Street/.test(m.addr) && /GPS -25\.\d+, 28\.\d+/.test(m.addr), JSON.stringify(m));
  }
});

// Map before it loads: Google blocked entirely, so the frame shows only what the page itself provides.
for (const width of PAGES.includes('/find-us/') ? [390, 1440] : []) await guarded('/find-us/', width, { viewport: { width, height: 900 } }, async (page) => {
  await page.route(/google\.com|gstatic\.com|googleapis\.com/, (r) => r.abort());
  if (!(await visit(page, BASE + '/find-us/', 'load', '/find-us/', width))) return;
  const m = await page.evaluate(() => {
    const vis = (el) => !!el && el.checkVisibility() && el.getBoundingClientRect().height > 0;
    const wait = document.querySelector('.loc-map-wait');
    const btn = document.querySelector('.map-bar a.btn-primary');
    btn?.scrollIntoView({ block: 'center', behavior: 'instant' });
    const r = btn?.getBoundingClientRect();
    // The button must be the element actually hit at its centre (nothing, such as an empty iframe, on top of it).
    const hit = r ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null;
    return { wait: vis(wait) ? wait.textContent.trim() : null, btn: vis(btn), clickable: !!hit && (hit === btn || btn.contains(hit)), addr: vis(document.querySelector('.map-bar-addr')) };
  });
  record('/find-us/', width, 'map placeholder: address, GPS and a clickable Maps button before the iframe loads', !!m.wait && m.btn && m.clickable && m.addr, JSON.stringify(m));
  // Keyboard: focusing the map iframe draws a ring on its frame.
  await page.focus('.loc-map iframe');
  const ring = await page.evaluate(() => {
    const cs = getComputedStyle(document.querySelector('.loc-map'));
    return { style: cs.outlineStyle, w: parseFloat(cs.outlineWidth), focused: document.activeElement?.tagName };
  });
  record('/find-us/', width, 'map frame shows a focus ring while the map has keyboard focus', ring.focused === 'IFRAME' && ring.style !== 'none' && ring.w > 0, JSON.stringify(ring));
});

// Shift+Tab focus visibility and reduced motion, per page at a phone and a desktop width.
for (const path of PAGES) {
  for (const width of [390, 1440]) await guarded(path, width, { viewport: { width, height: 900 }, reducedMotion: 'reduce' }, async (page) => {
    if (!(await visit(page, BASE + path, 'load', path, width))) return;
    const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && (a.effect?.getComputedTiming().iterations ?? 1) === Infinity).map((a) => `${a.effect?.target?.className ?? '?'}:${a.animationName ?? ''}`));
    record(path, width, 'prefers-reduced-motion: no endless animation runs', running.length === 0, running.join(', ') || 'none');
    await backwardFocusCheck(page, path, width);
  });
}

// Forward Tab: nothing focused sits under the fixed bar (860px and below), every stop of the page draws a focus
// ring, and every ring has 3:1 contrast.
// A 700px-high viewport, the height the finding was reproduced at: the bar takes a larger share of a short screen.
for (const path of PAGES) {
  for (const width of [390, 860, 1440]) await guarded(path, width, { viewport: { width, height: 700 }, reducedMotion: 'reduce' }, async (page) => {
    if (!(await visit(page, BASE + path, 'load', path, width))) return;
    await forwardFocusCheck(page, path, width);
  });
}

// Either side of each breakpoint, and on a full HD screen: the header Call link, the fixed bar, the quick-link row
// and overflow.
for (const path of PAGES) {
  for (const width of BRACKET_WIDTHS) await guarded(path, width, { viewport: { width, height: 900 } }, async (page) => {
    const res = await visit(page, BASE + path, 'networkidle', path, width);
    if (!res) return;
    record(path, width, 'status 200', res.status() === 200, String(res.status()));
    await overflowRow(page, path, width);
    await headerCallRow(page, path, width);
    await fixedBarRow(page, path, width);
    await quicknavRows(page, path, width);
  });
}

// JS on: the Home message builder shows its choices once it has bound, and rewrites the preview and the Send
// link's href. Missing hooks FAIL. The link is never clicked and Enter is never pressed (it opens wa.me).
if (PAGES.includes('/')) {
  const composeHooks = async (page) => {
    const hooks = {
      'form[data-compose]': await page.$('form[data-compose]'),
      '.compose-live': await page.$('form[data-compose] .compose-live'),
      '[data-compose-preview]': await page.$('form[data-compose] [data-compose-preview]'),
      '[data-compose-status]': await page.$('form[data-compose] [data-compose-status]'),
      'a[data-compose-send]': await page.$('form[data-compose] a[data-compose-send]'),
      'input[name="van"]': await page.$('form[data-compose] input[name="van"]'),
      '.picks label "A lift kit"': await page.$('form[data-compose] .picks label:has-text("A lift kit")'),
    };
    return { hooks, missing: Object.entries(hooks).filter(([, h]) => !h).map(([k]) => k) };
  };
  for (const width of [390, 1440]) await guarded('/', width, { viewport: { width, height: 900 } }, async (page) => {
    if (!(await visit(page, BASE + '/', 'networkidle', '/', width))) return;
    const { hooks, missing } = await composeHooks(page);
    record('/', width, 'message builder hooks present', missing.length === 0, missing.length ? `missing ${missing.join(', ')}` : `all ${Object.keys(hooks).length} hooks matched`);
    if (missing.length === 0) {
      const form = hooks['form[data-compose]'];
      const live = hooks['.compose-live'];
      const preview = hooks['[data-compose-preview]'];
      const send = hooks['a[data-compose-send]'];
      const decoded = async () => decodeURIComponent((await send.getAttribute('href')) ?? '');
      const ready = await form.getAttribute('data-compose-ready');
      record('/', width, 'message builder JS on: marked ready by its script, live controls visible', ready !== null && (await live.isVisible()), `data-compose-ready=${ready === null ? 'absent' : 'set'} live visible=${await live.isVisible()}`);
      const p0 = (await preview.textContent()).trim();
      record('/', width, 'message builder starts on the default message', p0 === COMPOSE_DEFAULT && (await decoded()) === `${WA_PREFIX}?text=${COMPOSE_DEFAULT}`, p0);
      await hooks['.picks label "A lift kit"'].click();
      await hooks['input[name="van"]'].fill('Jurgens Exclusive 2014');
      const p1 = (await preview.textContent()).trim();
      record('/', width, 'message builder preview after "A lift kit" and a make and year', p1 === COMPOSE_LIFT, p1);
      const href = await decoded();
      record('/', width, 'message builder Send href carries the same message', href === `${WA_PREFIX}?text=${COMPOSE_LIFT}`, href.slice(WA_PREFIX.length));

      // Screen readers: the message is announced once the visitor stops typing, not on every keystroke. The
      // announcement is its own polite live region (the visible preview is not one); the Send link never waits.
      const status = hooks['[data-compose-status]'];
      const van = hooks['input[name="van"]'];
      const previewLive = await preview.getAttribute('aria-live');
      const statusLive = await status.getAttribute('aria-live');
      await page.waitForTimeout(900); // let the announcement of the fill above land, then start from a known text
      const said0 = (await status.textContent()).trim();
      await van.press('End');
      await van.type(' LE', { delay: 60 });
      const saidTyping = (await status.textContent()).trim();
      const previewTyping = (await preview.textContent()).trim();
      const hrefTyping = await decoded();
      await page.waitForTimeout(900);
      const saidAfter = (await status.textContent()).trim();
      const typed = COMPOSE_LIFT.replace('2014.', '2014 LE.');
      record('/', width, 'message builder announces the message once typing stops, never per keystroke', previewLive === null && statusLive === 'polite' && said0 === COMPOSE_LIFT && saidTyping === COMPOSE_LIFT && previewTyping === typed && hrefTyping === `${WA_PREFIX}?text=${typed}` && saidAfter === typed, `preview aria-live=${previewLive} status aria-live=${statusLive}; announced before typing "${said0.slice(-22)}", while typing "${saidTyping.slice(-22)}", after "${saidAfter.slice(-25)}"; preview while typing "${previewTyping.slice(-25)}"`);
    }
  });
  await guarded('/', 390, { viewport: { width: 390, height: 900 } }, async (page) => {
    // JS on, but the builder's own script never arrives: the choices must stay hidden (they would do nothing) and
    // the Send link keeps the default message. Zero blocked requests fails: the block did not bite.
    let blocked = 0;
    expectFailure(page, /\/_astro\/[^/]*MessageBuilder[^/]*\.js/);
    await page.route(/\/_astro\/[^/]*MessageBuilder[^/]*\.js/, (r) => {
      blocked++;
      return r.abort();
    });
    if (await visit(page, BASE + '/', 'networkidle', '/', 390)) {
      const { hooks, missing } = await composeHooks(page);
      const live = hooks['.compose-live'];
      const send = hooks['a[data-compose-send]'];
      const liveShown = live ? await live.isVisible() : null;
      const href = send ? decodeURIComponent((await send.getAttribute('href')) ?? '') : null;
      record('/', 390, 'message builder script blocked: live controls hidden, Send link keeps the default message', missing.length === 0 && blocked > 0 && liveShown === false && (await send.isVisible()) && href === `${WA_PREFIX}?text=${COMPOSE_DEFAULT}`, missing.length ? `missing ${missing.join(', ')}` : `blocked=${blocked} live visible=${liveShown} href=${href?.slice(WA_PREFIX.length)}`);
    }
  });
  await guarded('/', 390, { viewport: { width: 390, height: 900 } }, async (page) => {
    // The script arrives, but the page it finds is not the page it was written for: no need is chosen (the
    // checked attribute is cut from the HTML on its way to the browser). It must leave the form unbound, so the
    // choices stay hidden and the Send link keeps the default message. Zero cuts fails: nothing was tested.
    const cuts = await stripFromHtml(page, BASE + '/', /(<input type="radio" name="need"[^>]*?) checked(?:="[^"]*")?/g, '$1');
    if (await visit(page, BASE + '/', 'networkidle', '/', 390)) {
      const { hooks, missing } = await composeHooks(page);
      const form = hooks['form[data-compose]'];
      const live = hooks['.compose-live'];
      const send = hooks['a[data-compose-send]'];
      const ready = form ? await form.getAttribute('data-compose-ready') : null;
      const liveShown = live ? await live.isVisible() : null;
      const href = send ? decodeURIComponent((await send.getAttribute('href')) ?? '') : null;
      record('/', 390, 'message builder with no need chosen in the markup: left unbound, Send link keeps the default message', missing.length === 0 && cuts.n > 0 && ready === null && liveShown === false && (await send.isVisible()) && href === `${WA_PREFIX}?text=${COMPOSE_DEFAULT}`, missing.length ? `missing ${missing.join(', ')}` : `checked attributes cut=${cuts.n} ready=${ready === null ? 'absent' : 'set'} live visible=${liveShown} href=${href?.slice(WA_PREFIX.length)}`);
    }
  });
}

// JS on: the live estimator updates the total, the pressed states and the CTA href. Missing hooks FAIL.
if (PAGES.includes(NEUTRAL_PAGE)) {
  for (const width of [390, 1440]) await guarded(NEUTRAL_PAGE, width, { viewport: { width, height: 900 } }, async (page) => {
    if (!(await visit(page, BASE + NEUTRAL_PAGE, 'networkidle', NEUTRAL_PAGE, width))) return;
    const q = async (sel) => (await page.$(sel));
    const stat = await q('.est-static');
    const live = await q('.est-live');
    const total = await q('[data-est-total]');
    const cta = await q('[data-est-cta]');
    const axle1 = await q('[data-axle="braked-1"]');
    const axle2 = await q('[data-axle="braked-2"]');
    const lift = await q('[data-addon="lift-kit"]');
    const unsure = await q('[data-axle="other"]');
    const missing = Object.entries({ '.est-static': stat, '.est-live': live, '[data-est-total]': total, '[data-est-cta]': cta, '[data-axle="braked-1"]': axle1, '[data-axle="braked-2"]': axle2, '[data-addon="lift-kit"]': lift, '[data-axle="other"]': unsure })
      .filter(([, h]) => !h).map(([k]) => k);
    record(NEUTRAL_PAGE, width, 'estimator hooks present', missing.length === 0, missing.length ? `missing ${missing.join(', ')}` : 'all 8 hooks matched');
    if (missing.length === 0) {
      const decoded = async () => decodeURIComponent((await cta.getAttribute('href')) ?? '');
      // Phase 2: the live controls are revealed by data-est-ready, which the estimator's own script sets once it
      // has bound them (it was html.js, which says only that some script ran).
      const ready = await page.getAttribute('[data-estimator]', 'data-est-ready');
      record(NEUTRAL_PAGE, width, 'estimator JS on: marked ready by its script, live visible, static hidden', ready !== null && (await live.isVisible()) && !(await stat.isVisible()), `data-est-ready=${ready === null ? 'absent' : 'set'}`);
      const t0 = (await total.textContent()).trim();
      record(NEUTRAL_PAGE, width, 'estimator starts on the default package', t0 === 'R1 499' && (await axle1.getAttribute('aria-pressed')) === 'true' && (await decoded()).includes('Single, braked: R1 499'), t0);
      await axle2.click();
      await lift.click();
      const t1 = (await total.textContent()).trim();
      const href = await decoded();
      record(NEUTRAL_PAGE, width, 'estimator total after Double braked + lift kit', t1 === 'R4 279', t1);
      record(
        NEUTRAL_PAGE,
        width,
        'estimator pressed states follow the clicks',
        (await axle2.getAttribute('aria-pressed')) === 'true' && (await axle1.getAttribute('aria-pressed')) === 'false' && (await lift.getAttribute('aria-pressed')) === 'true',
      );
      record(
        NEUTRAL_PAGE,
        width,
        'estimator CTA href carries the new estimate',
        href.startsWith(WA_PREFIX) && href.includes('Double, braked: R2 299') && href.includes('50 mm lift kit fitted: + R1 980') && href.includes('Total est.: R4 279'),
        href.slice(WA_PREFIX.length, WA_PREFIX.length + 90).replace(/\n/g, ' | '),
      );
      const optH = await axle2.evaluate((e) => e.getBoundingClientRect().height);
      record(NEUTRAL_PAGE, width, 'estimator options >= 44px high', optH >= 44, `${optH}px`);
      // "Not sure" is a starting price, never a confident total (screen and WhatsApp message).
      await unsure.click();
      const t2 = (await total.textContent()).replace(/\s+/g, ' ').trim();
      const href2 = await decoded();
      record(NEUTRAL_PAGE, width, 'estimator "Not sure" shows a "From" total and says so in the message', t2 === 'From R3 479' && href2.includes('Total est.: from R3 479 (excl. parts)'), `${t2} | ${href2.slice(-70).replace(/\n/g, ' | ')}`);
    }
  });
}

// The estimator's static fallback: what the visitor gets when the live estimator cannot work. The static add-on
// list shows, the live controls stay hidden (they would do nothing) and the CTA keeps the neutral enquiry. The link
// is never clicked. Two ways to get there, each of which must be seen to bite (a count of zero fails):
// its own script never arrives (the request is blocked), or the script arrives and finds a page without a hook it
// binds to (the attribute is cut from the HTML on its way to the browser), where it must return before binding.
const ESTIMATOR_FALLBACKS = [
  ['estimator script blocked: static list shown, live controls hidden, CTA keeps the neutral enquiry', 'blocked', null],
  ['estimator total hook cut from the HTML: left unbound, static list shown, CTA keeps the neutral enquiry', 'cut', / data-est-total(?=[\s>])/g],
  ['estimator axle hooks cut from the HTML: left unbound, static list shown, CTA keeps the neutral enquiry', 'cut', / data-axle="[^"]*"/g],
];
for (const [check, how, pattern] of PAGES.includes(NEUTRAL_PAGE) ? ESTIMATOR_FALLBACKS : []) await guarded(NEUTRAL_PAGE, 390, { viewport: { width: 390, height: 900 } }, async (page) => {
  let blocked = 0;
  let cuts = { n: 0 };
  if (how === 'blocked') {
    expectFailure(page, /\/_astro\/[^/]*Estimator[^/]*\.js/);
    await page.route(/\/_astro\/[^/]*Estimator[^/]*\.js/, (r) => {
      blocked++;
      return r.abort();
    });
  } else {
    cuts = await stripFromHtml(page, BASE + NEUTRAL_PAGE, pattern, '');
  }
  if (await visit(page, BASE + NEUTRAL_PAGE, 'networkidle', NEUTRAL_PAGE, 390)) {
    const root = await page.$('[data-estimator]');
    const stat = await page.$('.est-static');
    const live = await page.$('.est-live');
    const cta = await page.$('[data-est-cta]');
    const missing = Object.entries({ '[data-estimator]': root, '.est-static': stat, '.est-live': live, '[data-est-cta]': cta }).filter(([, h]) => !h).map(([k]) => k);
    const ready = root ? await root.getAttribute('data-est-ready') : null;
    const statShown = stat ? await stat.isVisible() : null;
    const liveShown = live ? await live.isVisible() : null;
    const href = cta ? await cta.getAttribute('href') : null;
    record(NEUTRAL_PAGE, 390, check, missing.length === 0 && blocked + cuts.n > 0 && ready === null && statShown === true && liveShown === false && (await cta.isVisible()) && href === NEUTRAL_ESTIMATE_HREF, missing.length ? `missing ${missing.join(', ')}` : `${how}=${blocked + cuts.n} ready=${ready === null ? 'absent' : 'set'} static visible=${statShown} live visible=${liveShown} href=${href?.slice(WA_PREFIX.length)}`);
  }
});

// The estimator appears without moving the page. Its script is held back 600ms so the page has painted before the
// live controls replace the static list, on a screen tall enough to show the estimator and the sections under it
// from the start; the layout shift the browser reports must stay near zero. Zero delayed requests fails.
if (PAGES.includes(NEUTRAL_PAGE)) await guarded(NEUTRAL_PAGE, 1440, { viewport: { width: 1440, height: 2400 } }, async (page) => {
  let delayed = 0;
  await page.route(/\/_astro\/[^/]*Estimator[^/]*\.js/, async (r) => {
    delayed++;
    await new Promise((res) => setTimeout(res, 600));
    return r.continue();
  });
  await page.addInitScript(() => {
    window.__cls = 0;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
    }).observe({ type: 'layout-shift', buffered: true });
  });
  if (await visit(page, BASE + NEUTRAL_PAGE, 'networkidle', NEUTRAL_PAGE, 1440)) {
    const bound = await page.waitForFunction(() => document.querySelector('[data-estimator]')?.hasAttribute('data-est-ready'), null, { timeout: 5000 }).then(() => true, () => false);
    await page.waitForTimeout(400);
    const m = await page.evaluate(() => {
      const est = document.querySelector('[data-estimator]')?.getBoundingClientRect();
      return { cls: window.__cls, onScreen: !!est && est.top < window.innerHeight && est.bottom > 0 };
    });
    record(NEUTRAL_PAGE, 1440, 'estimator binds late without moving the page (layout shift under 0.02)', delayed > 0 && bound && m.onScreen && m.cls < 0.02, `delayed=${delayed} bound=${bound} on screen=${m.onScreen} layout shift=${m.cls.toFixed(4)}`);
  }
});

// Quick-link sweep at common phone widths, on every checked page.
for (const path of PAGES) {
  for (const width of SWEEP_WIDTHS) await guarded(path, width, { viewport: { width, height: 900 } }, async (page) => {
    if (!(await visit(page, BASE + path, 'networkidle', path, width))) return;
    const qn = await quicknavState(page);
    const j = qn && !qn.hidden ? judgeQuicknav(qn) : { ok: false, detail: 'quicknav missing or hidden' };
    record(path, width, 'quicknav fits or visibly scrolls', j.ok, j.detail);
  });
}

// The 404 page ships with the build: overflow, header and CTA hold there too.
for (const width of WIDTHS) await guarded('/404.html', width, { viewport: { width, height: 900 } }, async (page) => {
  // A server that answers this URL with status 404 makes the browser log the failed load of the page itself.
  expectFailure(page, /\/404\.html$/);
  const res = await visit(page, BASE + '/404.html', 'networkidle', '/404.html', width);
  if (!res) return;
  record('/404.html', width, 'status 200 or 404', [200, 404].includes(res.status()), String(res.status()));
  const m = await page.evaluate(() => {
    const cta = document.querySelector('.nav-cta');
    const r = cta?.getBoundingClientRect();
    return {
      nav: (() => {
        const n = document.querySelector('.nav')?.getBoundingClientRect();
        const row = document.querySelector('.mobile-quicknav');
        const rr = row && getComputedStyle(row).display !== 'none' ? row.getBoundingClientRect() : null;
        return n ? (rr ? Math.max(n.bottom, rr.bottom) : n.bottom) - n.top : -1;
      })(),
      cta: r ? { h: r.height, inside: r.left >= 0 && r.right <= window.innerWidth } : null,
      h1: !!document.querySelector('h1'),
    };
  });
  await overflowRow(page, '/404.html', width);
  const limit = width <= 320 ? 140 : width <= 390 ? 130 : width <= 768 ? 140 : null;
  if (limit !== null) record('/404.html', width, `sticky header <= ${limit}px`, m.nav > 0 && m.nav <= limit, `${Math.round(m.nav)}px`);
  record('/404.html', width, 'header CTA visible, inside viewport, >= 44px', !!m.cta && m.cta.inside && m.cta.h >= 44, m.cta ? `h=${m.cta.h}` : 'missing .nav-cta');
  record('/404.html', width, 'has an h1', m.h1);
  await headerCallRow(page, '/404.html', width);
  const callH = await page.evaluate(() => document.querySelector('.notfound a[href="tel:+27833349357"]')?.getBoundingClientRect().height ?? 0);
  record('/404.html', width, 'page has a Call button, 44px+', callH >= 44, `h=${callH}`);
  // Phase 2: the 404 page is an ink hero and the price-board rows as the way back into the site.
  await inkHeroRow(page, '/404.html', width);
  const back = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('main .board a.board-row')];
    return { hrefs: rows.map((a) => a.getAttribute('href')), minH: rows.length ? Math.min(...rows.map((a) => a.getBoundingClientRect().height)) : 0, shown: rows.every((a) => a.checkVisibility()) };
  });
  record('/404.html', width, 'board rows lead back to the five service pages and Find us, 44px+', JSON.stringify(back.hrefs) === JSON.stringify([...DEFAULT_PAGES.filter((p) => p.startsWith('/services/')), '/find-us/']) && back.minH >= 44 && back.shown, `${back.hrefs.length} rows minH=${Math.round(back.minH)}`);
  // The outline: the board's rows are the level right under the page headline (h1 then h2, never h1 then h3).
  const levels = await page.evaluate(() => [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')].map((h) => Number(h.tagName[1])));
  const skips = levels.filter((l, i) => l > (levels[i - 1] ?? 0) + 1);
  record('/404.html', width, 'heading levels never skip one', levels.length > 1 && skips.length === 0, `levels ${levels.join('')}`);
});

// A missing nested URL must render the styled 404 page (root-relative assets), not a bare error or unstyled HTML.
// Needs the nginx container (error_page 404 /404.html); a plain static file server answers with its own error page.
for (const width of [390, 1440]) await guarded('/services/nope/', width, { viewport: { width, height: 900 } }, async (page) => {
  // The 404 status of the page itself is the point of this row, not a problem the page has.
  expectFailure(page, /\/services\/nope\/$/);
  const res = await visit(page, BASE + '/services/nope/', 'networkidle', '/services/nope/', width);
  if (!res) return;
  const s = await page.evaluate(() => ({
    h1: document.querySelector('h1')?.textContent.trim() ?? null,
    bg: getComputedStyle(document.body).backgroundColor,
    font: getComputedStyle(document.querySelector('h1') ?? document.body).fontFamily,
    nav: !!document.querySelector('.nav a.nav-call'),
    // The site's own assets must be root-relative. In production Cloudflare's edge injects its Web Analytics beacon
    // (https://static.cloudflareinsights.com/beacon.min.js/...), which is not ours: exactly that origin is exempt.
    rel: [...document.querySelectorAll('link[rel=stylesheet],script[src]')]
      .map((n) => n.getAttribute('href') ?? n.getAttribute('src'))
      .filter((u) => !u.startsWith('https://static.cloudflareinsights.com/beacon.min.js'))
      .every((u) => u.startsWith('/')),
  }));
  record('/services/nope/', width, 'missing nested URL is a 404 that renders styled', res?.status() === 404 && s.h1 === 'Page not found.' && s.bg === 'rgb(243, 243, 240)' && /bebas/i.test(s.font) && s.nav && s.rel, `status=${res?.status()} h1=${s.h1} bg=${s.bg} font=${s.font.slice(0, 20)} nav=${s.nav} rootRelative=${s.rel}`);
});

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
  const LEGACY_VIEW = { viewport: { width: 1440, height: 900 } };
  const reached = async (page, re) => {
    try {
      await page.waitForURL(re, { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  };
  for (const [hash, re] of LEGACY_REDIRECTS) await guarded(`/${hash}`, 'legacy', LEGACY_VIEW, async (page) => {
    if (await visit(page, `${BASE}/${hash}`, 'load', `/${hash}`, 'legacy')) {
      record(`/${hash}`, 'legacy', 'load redirects to its new home', await reached(page, re), page.url().replace(BASE, ''));
    }
  });
  for (const hash of LEGACY_STAYS) await guarded(`/${hash}`, 'legacy', LEGACY_VIEW, async (page) => {
    if (await visit(page, `${BASE}/${hash}`, 'load', `/${hash}`, 'legacy')) {
      await page.waitForTimeout(500);
      record(`/${hash}`, 'legacy', 'current-page anchor is left alone', page.url() === `${BASE}/${hash}`, page.url().replace(BASE, ''));
    }
  });
  await guarded('/', 'legacy', LEGACY_VIEW, async (page) => {
    // hashchange: the visitor is already on Home and clicks an old in-page link.
    if (await visit(page, `${BASE}/`, 'load', '/', 'legacy')) {
      await page.evaluate(() => { location.hash = '#pricing'; });
      record('/', 'legacy', 'hashchange to #pricing redirects', await reached(page, /\/services\/caravan-service\/#pricing$/), page.url().replace(BASE, ''));
    }
  });
}

// A readability-floor selector that matched nothing on any page is stale: it guards no text at all. Only judged
// when every default page was checked (a PAGES subset legitimately misses page-specific selectors).
if (DEFAULT_PAGES.every((p) => PAGES.includes(p))) {
  const stale = [...BODY_16, ...META_14, ...LABEL_13].filter((sel) => !floorMatches.get(sel));
  record('(all pages)', 'dom', 'every readability-floor selector matches on some page', stale.length === 0, stale.length ? `match nothing anywhere: ${stale.join(', ')}` : `${floorMatches.size} selectors matched`);
}

// What the pages themselves reported while they were being checked: one row per page that was visited. Any
// uncaught exception or console error on a page fails that page's row, whichever check was running at the time.
for (const [label, problems] of pageProblems) {
  record(label, 'js', 'no uncaught exception and no console error on the page', problems.size === 0, problems.size ? `${problems.size}: ${[...problems].slice(0, 3).join(' | ')}` : 'none reported in any visit');
}
record('(all pages)', 'js', 'pages were watched for exceptions and console errors', pageProblems.size >= PAGES.length, `${pageProblems.size} pages watched`);

await browser.close().catch(() => {});

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
