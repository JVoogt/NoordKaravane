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
// Phone widths around the point where the quick-link row stops fitting once the web font has swapped in.
const SWEEP_WIDTHS = [360, 375, 390, 412, 430, 440, 460, 480];
const WIDTHS = STANDARD_WIDTHS;
const WEIGHT_LIMIT = 250 * 1024;
const WA_PREFIX = 'https://wa.me/27833349357';
// Oracles for the estimator checks (hard-coded: plain JS never imports src).
const NEUTRAL_PAGE = '/services/caravan-service/';
const NEUTRAL_ESTIMATE_HREF = `${WA_PREFIX}?text=Hi%2C%20I'd%20like%20an%20estimate%20for%20a%20caravan%20service.`;
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

// Header Call button: a 44px phone-icon link beside the WhatsApp CTA, inside the viewport at every width.
// The tel: number and the aria-label are hard-coded oracles.
async function headerCallRow(page, path, width) {
  const hc = await page.evaluate(() => {
    const a = document.querySelector('.nav a.nav-call');
    const cta = document.querySelector('.nav-cta');
    if (!a || !cta) return null;
    const r = a.getBoundingClientRect();
    const c = cta.getBoundingClientRect();
    const cs = getComputedStyle(a);
    return {
      href: a.getAttribute('href'),
      label: a.getAttribute('aria-label'),
      w: r.width,
      h: r.height,
      visible: cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0,
      inside: r.left >= 0 && r.right <= window.innerWidth,
      beside: r.right <= c.left + 1 && Math.abs(r.top - c.top) < 30,
    };
  });
  const ok = !!hc && hc.visible && hc.inside && hc.beside && hc.w >= 44 && hc.h >= 44 && hc.href === 'tel:+27833349357' && hc.label === 'Call Noord Karavane';
  record(path, width, 'header Call button 44px, beside the WhatsApp CTA, inside viewport', ok, hc ? `${Math.round(hc.w)}x${Math.round(hc.h)} href=${hc.href} label=${hc.label} beside=${hc.beside}` : 'missing .nav a.nav-call');
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

  // Hero panel: from 1100px the fact/contact cards sit to the right of the hero text; below that they stack under it.
  if (service || isFind) {
    const hp = await page.evaluate(() => {
      const m = document.querySelector('.hero-main');
      const p = document.querySelector('.hero-panel');
      if (!m || !p) return null;
      const a = m.getBoundingClientRect();
      const b = p.getBoundingClientRect();
      return { right: b.left >= a.right - 1 && b.height > 0, stacked: b.top >= a.bottom - 1 };
    });
    const want = width >= 1100 ? 'right' : 'stacked';
    record(path, width, `hero panel is ${want === 'right' ? 'right of' : 'under'} the hero text`, !!hp && (want === 'right' ? hp.right : hp.stacked), hp ? `right=${hp.right} stacked=${hp.stacked}` : 'no .hero-panel');
  }

  // Tap targets on phones: FAQ rows, inline phone links, the Google chip and footer links are 44px+ high.
  if (width <= 700) {
    const small = await page.evaluate(() => {
      const bad = [];
      for (const sel of ['summary.faq-q', '.loc-v a[href^="tel:"]', '.hero-trust-item a', '.foot-col a', '.frame-fallback a']) {
        for (const el of document.querySelectorAll(sel)) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.height < 43.5) bad.push(`${sel}=${Math.round(r.height)}`);
        }
      }
      return [...new Set(bad)];
    });
    record(path, width, 'tap targets >= 44px (FAQ, phone links, Google chip, footer links)', small.length === 0, small.join(' '));
  }

  // Ticker: static on phones, paused while hovered on larger screens (WCAG 2.2.2).
  const tick = await page.evaluate(() => {
    const t = document.querySelector('.topbar-track');
    return t ? getComputedStyle(t).animationName : 'missing';
  });
  if (width <= 700) {
    record(path, width, 'ticker is static on phones', tick === 'none', `animation-name=${tick}`);
  } else {
    await page.hover('.topbar');
    const paused = await page.evaluate(() => getComputedStyle(document.querySelector('.topbar-track')).animationPlayState);
    await page.mouse.move(0, 400);
    record(path, width, 'ticker pauses on hover', paused === 'paused', `play-state=${paused}`);
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
    await jump(700);
    await page.waitForTimeout(500);
    const up = await navBottom();
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
  }

  // Page-specific rows.
  if (path === '/') {
    const chips = await page.evaluate(() => [...document.querySelectorAll('.hero-trust-item')].map((e) => e.textContent.trim()));
    record(path, width, 'Home trust chips do not repeat "WhatsApp direct"', !chips.some((c) => /whatsapp direct/i.test(c)), chips.join(' | '));
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
        facts: top('.facts'),
        chips: top('.chip-list'),
        badgeText: badge?.textContent.trim() ?? null,
        badgeSize: badge ? parseFloat(getComputedStyle(badge).fontSize) : 0,
        badgeGap: b ? Math.abs(h1.top - b.bottom) : null,
        badgeInHours: !!badge?.closest('.loc-card, .loc-v'),
        equal: !!call && !!wa && bg(call) === bg(wa) && bg(call) !== 'rgba(0, 0, 0, 0)',
        callFirst: !!call && !!wa && (call.compareDocumentPosition(wa) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
      };
    });
    record(path, width, 'Recoveries 24/7 is a visible badge beside the H1 (14px+)', r.badgeText === 'Recoveries 24/7' && r.badgeSize >= 14 && r.badgeGap !== null && r.badgeGap <= 48 && !r.badgeInHours, `text=${r.badgeText} size=${r.badgeSize} gap=${r.badgeGap && Math.round(r.badgeGap)}`);
    record(path, width, 'Recoveries Call and WhatsApp buttons carry equal weight, Call first', r.equal && r.callFirst, `equal=${r.equal} callFirst=${r.callFirst}`);
    if (width < 1100) {
      record(path, width, 'Recoveries actions sit above the fact cards and country pills', r.actions !== null && r.facts !== null && r.chips !== null && r.actions < r.facts && r.actions < r.chips, `actions=${Math.round(r.actions)} facts=${Math.round(r.facts)} chips=${Math.round(r.chips)}`);
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
      const specs = document.querySelector('#lift-kit .promo-specs');
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
    const proc = await page.evaluate(() => {
      const dots = [...document.querySelectorAll('.step-dot')].map((d) => getComputedStyle(d).backgroundColor);
      const cols = getComputedStyle(document.querySelector('.process')).gridTemplateColumns.split(' ').length;
      return { styles: new Set(dots).size, n: dots.length, cols };
    });
    record(path, width, 'process markers share one style' + (width <= 700 ? ' and stack in one column' : ''), proc.n === 5 && proc.styles === 1 && (width > 700 || proc.cols === 1), `n=${proc.n} styles=${proc.styles} cols=${proc.cols}`);
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
      const fb = document.querySelector('.frame-fallback a');
      return { dir: dir?.textContent.trim() ?? null, dirH: dir?.getBoundingClientRect().height ?? 0, fbBtn: !!fb?.classList.contains('btn-ghost'), fbH: fb?.getBoundingClientRect().height ?? 0 };
    });
    record(path, width, 'Find us hero has a "Get directions" button, map fallback is a ghost button (44px+)', f.dir === 'Get directions' && f.dirH >= 44 && f.fbBtn && f.fbH >= 44, `dir=${f.dir} ${f.dirH}px fallbackGhost=${f.fbBtn} ${f.fbH}px`);
  }
  if (service) {
    const loc = await page.evaluate(() => {
      const b = document.querySelector('.loc-card > a.btn');
      const c = b?.parentElement;
      if (!b || !c) return null;
      return { w: b.getBoundingClientRect().width, cw: c.getBoundingClientRect().width };
    });
    record(path, width, 'loc-card "Find us" button is not stretched', !!loc && loc.w < loc.cw * 0.6, loc ? `button ${Math.round(loc.w)}px in ${Math.round(loc.cw)}px card` : 'no .loc-card > a.btn');
  }
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
      // A cross-origin iframe (the Maps embed) never matches :focus-visible in the parent document, so its own
      // outline cannot be asserted here. It stays in the Tab order (checked below); only the ring test skips it.
      if (info.tag === 'iframe') continue;
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
    record(path, width, 'orange text contrast (4.5 small, 3 large)', contrast.bad.length === 0, contrast.bad.length ? contrast.bad.slice(0, 4).join('; ') : `${contrast.checked} orange text elements checked`);

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
  const expectDetails = path.startsWith('/services/') || path === '/find-us/'; // every page with a FAQ
  if (details.length === 0 && !expectDetails) {
    record(path, 'nojs', 'every <details> toggles (n/a)', true, 'n/a: none on this page');
  } else {
    record(path, 'nojs', 'every <details> toggles', details.length > 0 && toggled === details.length, `${toggled}/${details.length}`);
  }

  if (path === NEUTRAL_PAGE) {
    // JS off: the static estimator shows, the live controls stay hidden, the CTA is the neutral enquiry.
    const stat = await page.$('.est-static');
    const live = await page.$('.est-live');
    const cta = await page.$('[data-est-cta]');
    record(path, 'nojs', 'estimator .est-static visible', !!stat && (await stat.isVisible()), stat ? '' : 'selector .est-static matches nothing');
    record(path, 'nojs', 'estimator .est-live hidden', !!live && !(await live.isVisible()), live ? '' : 'selector .est-live matches nothing');
    const href = cta ? await cta.getAttribute('href') : null;
    record(path, 'nojs', 'estimator CTA is the neutral wa.me enquiry', href === NEUTRAL_ESTIMATE_HREF, href ?? 'selector [data-est-cta] matches nothing');
  }
  await context.close();
}

// JS on: the live estimator updates the total, the pressed states and the CTA href. Missing hooks FAIL.
if (PAGES.includes(NEUTRAL_PAGE)) {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    await page.goto(BASE + NEUTRAL_PAGE, { waitUntil: 'networkidle' });
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
      record(NEUTRAL_PAGE, width, 'estimator JS on: live visible, static hidden', (await live.isVisible()) && !(await stat.isVisible()));
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
    await context.close();
  }
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
  record('/404.html', width, 'no horizontal overflow', m.sw <= m.iw, `${m.sw} <= ${m.iw}`);
  const limit = width <= 320 ? 140 : width <= 390 ? 130 : width <= 768 ? 140 : null;
  if (limit !== null) record('/404.html', width, `sticky header <= ${limit}px`, m.nav > 0 && m.nav <= limit, `${Math.round(m.nav)}px`);
  record('/404.html', width, 'header CTA visible, inside viewport, >= 44px', !!m.cta && m.cta.inside && m.cta.h >= 44, m.cta ? `h=${m.cta.h}` : 'missing .nav-cta');
  record('/404.html', width, 'has an h1', m.h1);
  await headerCallRow(page, '/404.html', width);
  const callH = await page.evaluate(() => document.querySelector('.notfound a[href="tel:+27833349357"]')?.getBoundingClientRect().height ?? 0);
  record('/404.html', width, 'page has a Call button, 44px+', callH >= 44, `h=${callH}`);
  await context.close();
}

// A missing nested URL must render the styled 404 page (root-relative assets), not a bare error or unstyled HTML.
// Needs the nginx container (error_page 404 /404.html); a plain static file server answers with its own error page.
for (const width of [390, 1440]) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await context.newPage();
  const res = await page.goto(BASE + '/services/nope/', { waitUntil: 'networkidle' });
  const s = await page.evaluate(() => ({
    h1: document.querySelector('h1')?.textContent.trim() ?? null,
    bg: getComputedStyle(document.body).backgroundColor,
    font: getComputedStyle(document.querySelector('h1') ?? document.body).fontFamily,
    nav: !!document.querySelector('.nav a.nav-call'),
    rel: [...document.querySelectorAll('link[rel=stylesheet],script[src]')].every((n) => (n.getAttribute('href') ?? n.getAttribute('src')).startsWith('/')),
  }));
  record('/services/nope/', width, 'missing nested URL is a 404 that renders styled', res?.status() === 404 && s.h1 === 'Page not found.' && s.bg === 'rgb(14, 15, 17)' && /bebas/i.test(s.font) && s.nav && s.rel, `status=${res?.status()} h1=${s.h1} bg=${s.bg} font=${s.font.slice(0, 20)} nav=${s.nav} rootRelative=${s.rel}`);
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
