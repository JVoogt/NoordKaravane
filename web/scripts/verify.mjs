// Dist integrity check: parses the built pages in web/dist and fails on any broken promise of the plan.
// Plain Node, never imports from src: the page set, the hours, the seven old FAQ questions and the price
// amounts below are an independent oracle, so a typo in src/data fails here instead of agreeing with itself.
// The one shared file is the legacy hash map (JSON), which verify only reads.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'node-html-parser';

const WEB = fileURLToPath(new URL('../', import.meta.url));
const DIST = join(WEB, 'dist');
const ORIGIN = 'https://noordkaravane.co.za';
const ORG_ID = `${ORIGIN}/#org`;

// Oracle: design success criterion 2.
const ROUTES = [
  '/',
  '/services/caravan-service/',
  '/services/repairs/',
  '/services/solar-electrical/',
  '/services/recoveries/',
  '/services/lift-kits/',
  '/find-us/',
];
const SERVICE_ROUTES = ROUTES.filter((r) => r.startsWith('/services/'));
const fileOf = (route) => join(DIST, route === '/' ? 'index.html' : `${route.slice(1)}index.html`);

// Oracle: the seven old FAQ questions and the one page each lives on (Content Map).
const OLD_QUESTIONS = [
  ['What caravan services do you offer in Pretoria North?', '/services/caravan-service/'],
  ["What's included in a basic caravan service?", '/services/caravan-service/'],
  ['How much does a caravan service cost?', '/services/caravan-service/'],
  ['Do you do caravan and trailer recoveries?', '/services/recoveries/'],
  ['How long does a caravan service take?', '/services/caravan-service/'],
  ['Can you install solar panels on my caravan?', '/services/solar-electrical/'],
  ['Where is Noord Karavane located?', '/find-us/'],
];

// Oracle: the Google-profile hours the owner decided.
const TICKER_HOURS = 'Mon–Thu 08:00–16:00 · Fri 08:00–14:00';
const PROSE_HOURS = 'Monday to Thursday 08:00 to 16:00 and Friday 08:00 to 14:00';
const FORBIDDEN_STRINGS = ['17:00', 'Mon-Fri 08', 'Mon–Fri'];

// Oracle: the only price amounts the site may state.
const PRICE_AMOUNTS = new Set([949, 1499, 2299, 1980, 850, 1200]);
const PRICE_RANGE = 'R949 - R2 299';
// Oracle: which amounts each page may state anywhere (visible text, title, meta, JSON-LD). Related cards show the
// Caravan service tag (R949); the org node on Home and Find us carries priceRange (R949 - R2 299); Solar and
// Recoveries state no price of their own, and Solar has no related card that carries one.
const ROUTE_PRICES = {
  '/': [949, 1980, 2299],
  '/services/caravan-service/': [949, 1499, 2299, 1980, 850, 1200],
  '/services/repairs/': [949],
  '/services/solar-electrical/': [],
  '/services/recoveries/': [949],
  '/services/lift-kits/': [1980, 949],
  '/find-us/': [949, 2299],
};

// Oracle: the WhatsApp message each page's primary CTA and header CTA must carry (decoded text parameter).
const CTA_TEXT = {
  '/': "Hi, I'd like to book a service slot.",
  '/services/caravan-service/': "Hi, I'd like to book a caravan service or repair.",
  '/services/repairs/': "Hi, I'd like help with caravan bearings, brakes or chassis work.",
  '/services/solar-electrical/': "Hi, I'd like a quote for caravan electrical or solar work.",
  '/services/recoveries/': 'Hi, I need help with a caravan or trailer recovery.',
  '/services/lift-kits/': "Hi, I'm interested in the 50 mm caravan lift kit (R1 980).",
  '/find-us/': "Hi, I'd like to book a time to bring in my caravan.",
};

const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ''); // same one-liner as src/lib/faq normalizeForParity
const squash = (s) => s.replace(/\s+/g, ' ').trim();

let failures = 0;
function report(ok, check, where, detail = '') {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'} [${check}] ${where}${detail ? ` :: ${detail}` : ''}`);
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

if (!existsSync(DIST)) {
  console.error('verify: web/dist does not exist, run `npm run build` first');
  process.exit(1);
}

const allFiles = walk(DIST);
const htmlFiles = allFiles.filter((f) => f.endsWith('.html'));
const pages = new Map(); // route -> { root, raw }
for (const route of ROUTES) {
  const f = fileOf(route);
  if (existsSync(f)) {
    const raw = readFileSync(f, 'utf8');
    pages.set(route, { raw, root: parse(raw) });
  }
}
const notFoundRaw = existsSync(join(DIST, '404.html')) ? readFileSync(join(DIST, '404.html'), 'utf8') : '';
const have = ROUTES.filter((r) => pages.has(r)); // checks below run on the pages that exist; check 1 reports the rest

/** Visible text of a node: scripts, styles and templates removed, entities decoded. */
function visibleText(node) {
  const clone = parse(node.outerHTML);
  clone.querySelectorAll('script,style,template').forEach((n) => n.remove());
  return squash(clone.text);
}

const jsonStrings = (v) => (typeof v === 'string' ? [v] : v && typeof v === 'object' ? Object.values(v).flatMap(jsonStrings) : []);
const metaContents = (root) => root.querySelectorAll('meta[content]').map((m) => squash(m.getAttribute('content') ?? ''));

function jsonLdBlocks(root) {
  return root.querySelectorAll('script[type="application/ld+json"]').map((s) => {
    try {
      return { ok: true, data: JSON.parse(s.text) };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  });
}
const graphOf = (route) => {
  const b = jsonLdBlocks(pages.get(route).root)[0];
  return b && b.ok && Array.isArray(b.data['@graph']) ? b.data['@graph'] : [];
};

// 1. Page set.
{
  const expected = new Set([...ROUTES.map(fileOf), join(DIST, '404.html')]);
  const actual = new Set(htmlFiles);
  const missing = [...expected].filter((f) => !actual.has(f)).map((f) => relative(DIST, f));
  const extra = [...actual].filter((f) => !expected.has(f)).map((f) => relative(DIST, f));
  report(missing.length === 0 && extra.length === 0, '1 page set', `${actual.size} html files, expected ${expected.size}`, `missing=[${missing}] extra=[${extra}]`);
  report(!existsSync(join(DIST, 'shop')), '1 page set', 'dist/shop is absent (the shop is another app)');
}

// 2. h1, title, description, canonical.
{
  const titles = new Map();
  const descs = new Map();
  for (const route of have) {
    const { root } = pages.get(route);
    const h1 = root.querySelectorAll('h1').length;
    report(h1 === 1, '2 head', route, `h1 count ${h1}`);
    const title = squash(root.querySelector('title')?.text ?? '');
    const desc = squash(root.querySelector('meta[name="description"]')?.getAttribute('content') ?? '');
    const canonical = root.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? '';
    report(title !== '' && desc !== '', '2 head', route, `title ${title ? 'present' : 'MISSING'}, description ${desc ? 'present' : 'MISSING'}`);
    report(canonical === ORIGIN + route && canonical.endsWith('/'), '2 head', route, `canonical ${canonical || 'MISSING'}`);
    titles.set(title, [...(titles.get(title) ?? []), route]);
    descs.set(desc, [...(descs.get(desc) ?? []), route]);
  }
  const dup = (m) => [...m].filter(([k, v]) => k && v.length > 1).map(([k, v]) => `"${k.slice(0, 40)}" on ${v.join(' and ')}`);
  report(dup(titles).length === 0, '2 head', 'titles are unique', dup(titles).join('; '));
  report(dup(descs).length === 0, '2 head', 'meta descriptions are unique', dup(descs).join('; '));
  const nf = parse(notFoundRaw);
  report(nf.querySelectorAll('h1').length === 1, '2 head', '/404.html', 'h1 count');
}

// 3. JSON-LD.
{
  const aggregate = htmlFiles.filter((f) => readFileSync(f, 'utf8').includes('aggregateRating')).map((f) => relative(DIST, f));
  report(aggregate.length === 0, '3 json-ld', 'no aggregateRating anywhere in dist', aggregate.join(', '));
  for (const route of have) {
    const blocks = jsonLdBlocks(pages.get(route).root);
    report(blocks.length === 1 && blocks.every((b) => b.ok), '3 json-ld', route, `${blocks.length} block(s), ${blocks.filter((b) => !b.ok).length} unparsable`);
    if (blocks.length !== 1 || !blocks[0].ok) continue;
    const graph = graphOf(route);
    // A "full" organisation node is defined by its fields, not by @type: the service-page stub shares the type.
    const orgs = graph.filter((n) => n['@id'] === ORG_ID);
    const full = orgs.filter((n) => n.openingHoursSpecification && n.address);
    if (route !== '/') {
      const count = (type) => graph.filter((n) => [].concat(n['@type'] ?? []).includes(type)).length;
      report(count('BreadcrumbList') === 1 && count('FAQPage') === 1, '3 json-ld', route, `BreadcrumbList x${count('BreadcrumbList')}, FAQPage x${count('FAQPage')} (each must be exactly 1)`);
    }
    if (route === '/' || route === '/find-us/') {
      const types = [].concat(full[0]?.['@type'] ?? []);
      report(orgs.length === 1 && full.length === 1 && types.includes('AutoRepair'), '3 json-ld', route, `full AutoRepair node with @id ${ORG_ID}: ${full.length} of ${orgs.length} org node(s)`);
    } else {
      const refs = graph.filter((n) => n.provider?.['@id'] === ORG_ID).length;
      report(full.length === 0 && refs >= 1, '3 json-ld', route, `no full org node (${full.length}), ${refs} node(s) referencing ${ORG_ID}`);
    }
  }
}

// 4. FAQ parity, per page: visible <details> against FAQPage JSON-LD.
const faqByPage = new Map(); // route -> [{ q, a }] visible
for (const route of have) {
  const root = pages.get(route).root;
  const items = root.querySelectorAll('details.faq-item').map((d) => {
    const spans = d.querySelectorAll('summary > span');
    const q = squash(spans[1]?.text ?? '');
    const a = squash(d.querySelector('.faq-a')?.text ?? '');
    return { q, a };
  });
  faqByPage.set(route, items);
  const faqNodes = graphOf(route).filter((n) => n['@type'] === 'FAQPage');
  if (items.length === 0 && faqNodes.length === 0) {
    report(true, '4 faq parity', route, 'no FAQ on this page and none in JSON-LD');
    continue;
  }
  const ld = (faqNodes[0]?.mainEntity ?? []).map((e) => ({ q: squash(e.name ?? ''), a: squash(e.acceptedAnswer?.text ?? '') }));
  report(faqNodes.length === 1 && JSON.stringify(items.map((i) => i.q)) === JSON.stringify(ld.map((i) => i.q)), '4 faq parity', route, `questions: ${items.length} visible, ${ld.length} in JSON-LD, same order`);
  const bad = items.filter((it, i) => !ld[i] || normalize(it.a) !== normalize(ld[i].a)).map((it) => it.q);
  report(bad.length === 0, '4 faq parity', route, bad.length ? `answers differ for: ${bad.join(' | ')}` : 'visible answers equal JSON-LD answers');
}

// 4b. FAQ uniqueness across pages.
{
  const where = new Map(); // normalised question -> pages
  for (const [route, items] of faqByPage) for (const it of items) where.set(normalize(it.q), [...(where.get(normalize(it.q)) ?? []), route]);
  for (const [question, page] of OLD_QUESTIONS) {
    const found = where.get(normalize(question)) ?? [];
    report(found.length === 1 && found[0] === page, '4b faq unique', `"${question}"`, `expected only on ${page}, found on [${found}]`);
  }
  // (ii) no identical sentence of 20+ normalised characters on two pages (or twice on one page).
  const seen = new Map(); // sentence -> [{route, raw}]
  for (const route of have) {
    const root = pages.get(route).root;
    const blocks = root.querySelectorAll('details.faq-item .faq-a p, details.faq-item .faq-a li').map((n) => n.text);
    for (const block of blocks) {
      for (const piece of block.split(/[.!?]/)) {
        const n = normalize(piece);
        if (n.length < 20) continue;
        seen.set(n, [...(seen.get(n) ?? []), { route, text: squash(piece) }]);
      }
    }
  }
  const repeats = [...seen.values()].filter((v) => v.length > 1);
  report(repeats.length === 0, '4b faq unique', 'no FAQ sentence repeats across or within pages', repeats.map((v) => `"${v[0].text.slice(0, 60)}" on [${v.map((x) => x.route)}]`).join('; '));
  // (iii) no whole answer identical across pages.
  const answers = new Map();
  for (const [route, items] of faqByPage) for (const it of items) answers.set(normalize(it.a), [...(answers.get(normalize(it.a)) ?? []), route]);
  const sameAnswer = [...answers].filter(([k, v]) => k && new Set(v).size > 1);
  report(sameAnswer.length === 0, '4b faq unique', 'no whole FAQ answer is shared by two pages', sameAnswer.map(([, v]) => v.join(' and ')).join('; '));
}

// 5. Hours.
{
  const textFiles = allFiles.filter((f) => /\.(html|xml|txt|css|js|json)$/.test(f));
  for (const needle of FORBIDDEN_STRINGS) {
    const hits = textFiles.filter((f) => readFileSync(f, 'utf8').includes(needle)).map((f) => relative(DIST, f));
    report(hits.length === 0, '5 hours', `dist has no "${needle}"`, hits.join(', '));
  }
  const home = pages.get('/');
  if (home) {
    const ticker = squash(home.root.querySelector('.topbar')?.text ?? '');
    report(ticker.includes(TICKER_HOURS), '5 hours', '/ ticker', `contains "${TICKER_HOURS}"`);
    const strip = visibleText(home.root.querySelector('#location') ?? home.root);
    report(strip.includes('08:00 to 16:00') && strip.includes('08:00 to 14:00'), '5 hours', '/ location strip', 'has 08:00 to 16:00 and 08:00 to 14:00');
  }
  const find = pages.get('/find-us/');
  if (find) {
    const text = visibleText(find.root.querySelector('main'));
    report(text.includes('08:00 to 16:00') && text.includes('08:00 to 14:00'), '5 hours', '/find-us/', 'has 08:00 to 16:00 and 08:00 to 14:00');
    const q07 = (faqByPage.get('/find-us/') ?? []).find((i) => normalize(i.q) === normalize('Where is Noord Karavane located?'));
    report(!!q07 && q07.a.includes(PROSE_HOURS), '5 hours', '/find-us/ FAQ Q07', `contains "${PROSE_HOURS}"`);
  }
}

// 6. Prices: visible text, title, meta/og/twitter content and JSON-LD string values; never other attributes (wa.me
// hrefs) or asset file names. Each page may only state the amounts in its own allow-list.
{
  for (const route of have) {
    const { root } = pages.get(route);
    const texts = [visibleText(root), ...metaContents(root), ...jsonLdBlocks(root).filter((b) => b.ok).flatMap((b) => jsonStrings(b.data))];
    const allowed = new Set(ROUTE_PRICES[route]);
    const problems = [];
    for (const t of texts) {
      for (const m of t.matchAll(/\bR\d+(?: \d{3})*/g)) {
        const amount = Number(m[0].slice(1).replace(/ /g, ''));
        if (!PRICE_AMOUNTS.has(amount)) problems.push(`${m[0]} is not a known amount`);
        else if (amount >= 1000 && !m[0].includes(' ')) problems.push(`${m[0]} has no space grouping`);
        else if (!allowed.has(amount)) problems.push(`${m[0]} is not allowed on this page (allowed: ${[...allowed].join(', ') || 'none'})`);
      }
    }
    report(problems.length === 0, '6 prices', route, [...new Set(problems)].join('; '));
  }
  const org = pages.has('/') ? graphOf('/').find((n) => n['@id'] === ORG_ID) : undefined;
  report(org?.priceRange === PRICE_RANGE, '6 prices', '/ JSON-LD priceRange', `expected "${PRICE_RANGE}", got ${JSON.stringify(org?.priceRange)}`);
}

// 7. Internal links and fragments.
{
  const ids = new Map(); // dist file -> Set of ids
  const idsOf = (file) => {
    if (!ids.has(file)) ids.set(file, new Set(parse(readFileSync(file, 'utf8')).querySelectorAll('[id]').map((n) => n.getAttribute('id'))));
    return ids.get(file);
  };
  const resolveTarget = (target, fromRoute) => {
    // -> { file, hash } or { error }
    const hashAt = target.indexOf('#');
    const hash = hashAt === -1 ? '' : target.slice(hashAt + 1);
    const pathPart = (hashAt === -1 ? target : target.slice(0, hashAt)).split('?')[0];
    const path = pathPart === '' ? fromRoute : pathPart;
    const file = path.endsWith('/') ? join(DIST, path.slice(1), 'index.html') : join(DIST, path.slice(1));
    return { file, hash, path };
  };
  const legacy = JSON.parse(readFileSync(join(WEB, 'src/data/legacy-hash-map.json'), 'utf8'));
  const problems = [];
  const checkTarget = (target, fromRoute, label) => {
    if (/^(mailto:|tel:|javascript:|data:)/i.test(target)) return;
    // Resolve against the page URL: root-relative, relative, fragment-only and same-origin absolute all end up here.
    let u;
    try {
      u = new URL(target, ORIGIN + fromRoute);
    } catch {
      problems.push(`${label}: ${target} is not a valid URL`);
      return;
    }
    if (u.origin !== ORIGIN || u.pathname.startsWith('/shop/')) return;
    const { file, hash, path } = resolveTarget(u.pathname + u.hash, fromRoute);
    if (!existsSync(file) || !statSync(file).isFile()) problems.push(`${label}: ${target} has no file (${path})`);
    else if (hash && file.endsWith('.html') && !idsOf(file).has(hash)) problems.push(`${label}: ${target} has no #${hash} in ${path}`);
  };
  for (const route of have) {
    for (const n of pages.get(route).root.querySelectorAll('[href],[src]')) {
      const target = n.getAttribute('href') ?? n.getAttribute('src');
      checkTarget(target, route, route);
    }
  }
  for (const [hash, target] of Object.entries(legacy)) checkTarget(target, '/', `legacy ${hash}`);
  report(problems.length === 0, '7 links', `${have.length} pages and ${Object.keys(legacy).length} legacy targets`, problems.slice(0, 8).join('; '));
}

// 8. Images.
{
  for (const route of have) {
    const imgs = pages.get(route).root.querySelectorAll('img');
    const bad = imgs.filter((i) => !(i.getAttribute('alt') ?? '').trim() || !i.getAttribute('width') || !i.getAttribute('height')).map((i) => i.getAttribute('src') ?? '?');
    report(bad.length === 0, '8 images', route, `${imgs.length} img, ${bad.length ? `bad: ${bad.join(', ')}` : 'all have alt, width and height'}`);
  }
}

// 9. Home word count, em dashes.
{
  const home = pages.get('/');
  if (home) {
    const words = visibleText(home.root.querySelector('main')).split(' ').filter(Boolean).length;
    report(words >= 450 && words <= 750, '9 copy', '/ <main> word count', `${words} (allowed 450-750)`);
  }
  const EM_DASH = String.fromCharCode(0x2014);
  // The raw needle catches an entity left in the markup; the decoded text and attribute values catch any other
  // spelling (named, decimal, hex, any case or padding) that a browser would turn into U+2014.
  const ENTITY = /&(?:mdash|#0*8212|#x0*2014);/i;
  const dashes = htmlFiles.filter((f) => {
    const raw = readFileSync(f, 'utf8');
    if (raw.includes(EM_DASH) || ENTITY.test(raw)) return true;
    const root = parse(raw);
    return root.text.includes(EM_DASH) || root.querySelectorAll('*').some((n) => Object.values(n.attributes).some((v) => v.includes(EM_DASH)));
  }).map((f) => relative(DIST, f));
  report(dashes.length === 0, '9 copy', 'no em dash (literal, entity or decoded) in any page', dashes.join(', '));
}

// 10. Sitemap and robots.
{
  const read = (f) => (existsSync(join(DIST, f)) ? readFileSync(join(DIST, f), 'utf8') : '');
  const locs = [...read('sitemap-0.xml').matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]).sort();
  const want = ROUTES.map((r) => ORIGIN + r).sort();
  report(JSON.stringify(locs) === JSON.stringify(want), '10 sitemap', 'sitemap-0.xml lists exactly the 7 routes', `${locs.length} loc(s); missing=[${want.filter((u) => !locs.includes(u))}] extra=[${locs.filter((u) => !want.includes(u))}]`);
  report(locs.every((u) => u.endsWith('/') && u.startsWith(`${ORIGIN}/`)), '10 sitemap', 'every loc ends in / on the apex host');
  const index = read('sitemap-index.xml');
  report(index.includes(`${ORIGIN}/shop/sitemap.xml`) && index.includes(`${ORIGIN}/sitemap-0.xml`), '10 sitemap', 'sitemap-index.xml lists sitemap-0 and the shop sitemap');
  report(read('robots.txt').includes('sitemap-index.xml'), '10 sitemap', 'robots.txt references sitemap-index.xml');
}

// 11. Reviews guard.
{
  const src = readFileSync(join(WEB, 'src/data/reviews.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const approved = /approved\s*:\s*true/.test(src);
  const quotes = pages.get('/')?.root.querySelectorAll('blockquote').length ?? 0;
  report(approved || quotes === 0, '11 reviews', '/', approved ? 'an approved review exists, quotes allowed' : `no approved review, ${quotes} blockquote(s)`);
}

// 12. WhatsApp CTAs: the hero primary CTA and the header CTA carry the page's own message (decoded text parameter).
{
  const textParam = (href) => {
    try {
      return new URL(href).searchParams.get('text');
    } catch {
      return null;
    }
  };
  for (const route of have) {
    const root = pages.get(route).root;
    const hero = root.querySelector('.hero-actions a[href^="https://wa.me/27833349357"]')?.getAttribute('href');
    const nav = root.querySelector('.nav-cta')?.getAttribute('href');
    const want = CTA_TEXT[route];
    report(hero !== undefined && textParam(hero) === want, '12 cta text', `${route} hero CTA`, `want ${JSON.stringify(want)}, got ${JSON.stringify(hero === undefined ? 'no hero wa.me link' : textParam(hero))}`);
    report(nav !== undefined && textParam(nav) === want, '12 cta text', `${route} header CTA`, `want ${JSON.stringify(want)}, got ${JSON.stringify(nav === undefined ? 'no .nav-cta' : textParam(nav))}`);
  }
}

// 13. Render sweep: no template accident reaches a visitor (visible text, title, meta, JSON-LD strings).
{
  const BAD = /\b(undefined|NaN|null)\b|\[object Object\]|R(NaN|undefined)|\{(hours|price:[^}]*)\}/;
  for (const route of have) {
    const root = pages.get(route).root;
    const hits = [visibleText(root), ...metaContents(root), ...jsonLdBlocks(root).filter((b) => b.ok).flatMap((b) => jsonStrings(b.data))]
      .map((t) => t.match(BAD)?.[0])
      .filter(Boolean);
    report(hits.length === 0, '13 render sweep', route, [...new Set(hits)].join(', '));
  }
}

if (failures > 0) {
  console.error(`verify: FAIL (${failures})`);
  process.exit(1);
}
console.log('verify: all checks passed');
