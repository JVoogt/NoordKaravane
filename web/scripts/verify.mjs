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
const GBP_URL = 'https://www.google.com/maps?cid=1109550773885984048';

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
      // The Google Business Profile is part of the entity: its stable cid URL, beside Facebook (oracle, not imported).
      const same = [].concat(full[0]?.sameAs ?? []);
      report(same.includes(GBP_URL) && same.includes('https://www.facebook.com/NoordKaravane') && full[0]?.hasMap === GBP_URL, '3 json-ld', `${route} sameAs`, `sameAs=${JSON.stringify(same)} hasMap=${full[0]?.hasMap}`);
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
  // Robots policy: search and live-answer agents named and allowed, training crawlers named and disallowed, everyone
  // else allowed. Groups are parsed the RFC 9309 way (consecutive User-agent lines share the rules under them).
  const groups = [];
  let cur = null;
  for (const raw of read('robots.txt').split('\n')) {
    const line = raw.replace(/#.*/, '').trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const [, key, val] = [m[0], m[1].toLowerCase(), m[2].trim()];
    if (key === 'user-agent') {
      if (!cur || cur.rules.length) groups.push((cur = { agents: [], rules: [] }));
      cur.agents.push(val.toLowerCase());
    } else if (cur && (key === 'allow' || key === 'disallow')) cur.rules.push(`${key}:${val}`);
  }
  const rulesFor = (agent) => groups.filter((g) => g.agents.includes(agent.toLowerCase())).flatMap((g) => g.rules);
  for (const bot of ['OAI-SearchBot', 'ChatGPT-User', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot']) {
    const r = rulesFor(bot);
    report(r.includes('allow:/') && !r.some((x) => x.startsWith('disallow:/')), '10 robots', `${bot} is named and allowed`, r.join(' ') || 'not named');
  }
  for (const bot of ['GPTBot', 'ClaudeBot', 'Google-Extended', 'CCBot']) {
    const r = rulesFor(bot);
    report(r.includes('disallow:/') && !r.includes('allow:/'), '10 robots', `${bot} (training) is disallowed`, r.join(' ') || 'not named');
  }
  const star = rulesFor('*');
  report(star.includes('allow:/') && !star.includes('disallow:/'), '10 robots', '* (Googlebot, Bingbot and the rest) is allowed', star.join(' '));
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
    const float = root.querySelector('a.wa-float')?.getAttribute('href');
    report(float !== undefined && textParam(float) === want, '12 cta text', `${route} floating WhatsApp button`, `want ${JSON.stringify(want)}, got ${JSON.stringify(float === undefined ? 'no .wa-float' : textParam(float))}`);
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

// 14. Page structure (design review round): Caravan service order, the closing CTA band on every page,
// the header Call button, the Home trust chips.
{
  const CARAVAN = '/services/caravan-service/';
  if (pages.has(CARAVAN)) {
    const order = pages.get(CARAVAN).root.querySelectorAll('main > header, main > section').map((n) => n.getAttribute('id') ?? n.tagName.toLowerCase());
    const want = ['header', 'pricing', 'inspection-report', 'process', 'faq'];
    report(JSON.stringify(order.slice(0, 5)) === JSON.stringify(want), '14 structure', `${CARAVAN} section order`, `got ${order.join(' > ')}`);
  }
  for (const route of have) {
    const root = pages.get(route).root;
    const lastSection = root.querySelectorAll('main > section').at(-1);
    const band = lastSection?.querySelector('.contact');
    const ok = !!band && !!band.querySelector('a[href^="https://wa.me/27833349357"]') && !!band.querySelector('a[href="tel:+27833349357"]');
    report(ok, '14 structure', `${route} closing CTA band`, ok ? 'last section has a WhatsApp and a Call link' : 'last <main> section has no .contact band with both links');
    const call = root.querySelector('.nav a.nav-call');
    // Redesign (2026-11-14): the header Call link shows the number as text (or "Call" on Recoveries) instead of a
    // bare phone icon, so its accessible name now carries the number as well (the name must contain the visible text).
    report(!!call && call.getAttribute('href') === 'tel:+27833349357' && call.getAttribute('aria-label') === 'Call Noord Karavane on 083 334 9357', '14 structure', `${route} header Call button`, call ? 'tel link and aria-label ok' : 'no .nav a.nav-call');
    // Recoveries: Call is the header's primary (filled) action; elsewhere WhatsApp booking is. The topbar on
    // Recoveries is the 24/7 line with the number and carries no workshop hours.
    const rec = route === '/services/recoveries/';
    report(call?.classList.contains('nav-call--primary') === rec, '14 structure', `${route} header primary action`, rec ? 'Call is primary' : 'WhatsApp booking is primary');
    const top = root.querySelector('.topbar');
    const topText = squash(top?.text ?? '');
    report(rec ? topText === 'Recoveries 24/7 · Call 083 334 9357' && !/\d\d:\d\d/.test(topText) : !!top?.querySelector('.topbar-track'), '14 structure', `${route} topbar`, topText.slice(0, 80));
  }
  if (pages.has('/')) {
    const chips = pages.get('/').root.querySelectorAll('.hero-trust-item').map((n) => squash(n.text));
    report(!chips.some((c) => /whatsapp direct/i.test(c)), '14 structure', '/ trust chips', chips.join(' | '));
  }
}

// 15. Site redesign (2026-11-14): the Home page's new structure and the shared chrome every page carries.
// Every literal here is an oracle typed by hand from the approved prototype and the owner's facts, never read from src.
{
  const WA = 'https://wa.me/27833349357';
  const TEL = 'tel:+27833349357';
  const textParam = (href) => {
    try {
      return new URL(href).searchParams.get('text');
    } catch {
      return null;
    }
  };
  const home = pages.get('/');
  if (home) {
    const root = home.root;
    const h1 = squash(root.querySelector('h1')?.text ?? '');
    report(h1 === 'Caravan workshop in Pretoria North. Keep her road-ready.', '15 redesign', '/ h1 says the place first, then the headline', h1);
    const ids = ['services', 'why-us', 'reviews', 'recoveries', 'location', 'rentals'];
    const missingIds = ids.filter((id) => !root.querySelector(`main [id="${id}"]`));
    report(missingIds.length === 0, '15 redesign', '/ section ids', missingIds.length ? `missing: ${missingIds.join(', ')}` : ids.join(', '));

    // Relocated hero lede: each of its three sentences still stands, in its new place.
    const lede = squash(root.querySelector('.hero .lede')?.text ?? '');
    report(lede === "You see what we found, and what it'll cost, before we pick up a spanner.", '15 redesign', '/ hero sentence', lede || 'no .hero .lede');
    const servicesText = visibleText(root.querySelector('#services') ?? parse(''));
    report(servicesText.includes('Caravan servicing, repairs, electrical and solar, 50 mm lift kits and recoveries, from 252 General Beyers Street.'), '15 redesign', '/ services intro sentence sits in #services');
    const howText = visibleText(root.querySelector('#why-us') ?? parse(''));
    report(howText.includes('Services and repairs start with an inspection.'), '15 redesign', '/ inspection sentence opens #why-us');

    // Images: the hero photo is the one eager, high-priority image; everything else in <main> is lazy.
    const heroImg = root.querySelector('.hero img');
    report(!!heroImg && heroImg.getAttribute('loading') === 'eager' && heroImg.getAttribute('fetchpriority') === 'high', '15 redesign', '/ hero image is eager with fetchpriority high', heroImg ? `loading=${heroImg.getAttribute('loading')} fetchpriority=${heroImg.getAttribute('fetchpriority')}` : 'no .hero img');
    const notLazy = root.querySelectorAll('main img').filter((i) => i !== heroImg && i.getAttribute('loading') !== 'lazy').map((i) => i.getAttribute('alt'));
    report(root.querySelectorAll('main img').length >= 8 && notLazy.length === 0, '15 redesign', '/ every other image in main is lazy', `${root.querySelectorAll('main img').length} img, not lazy: [${notLazy.join(' | ')}]`);

    // Price board: one linked row per service page, in route order.
    const rows = root.querySelectorAll('#services a.board-row').map((a) => a.getAttribute('href'));
    report(JSON.stringify(rows) === JSON.stringify(SERVICE_ROUTES), '15 redesign', '/ price board rows link to the five service pages', rows.join(' '));

    // WhatsApp message builder: a plain wa.me link with the default message is in the markup (works with scripting off).
    const send = root.querySelector('#why-us [data-compose] a[data-compose-send]')?.getAttribute('href');
    report(!!send && send.startsWith(`${WA}?text=`) && textParam(send) === "Hi, I'd like to book a service. I can send a photo.", '15 redesign', '/ message builder falls back to a plain wa.me link', send ? JSON.stringify(textParam(send)) : 'no [data-compose] a[data-compose-send]');
    const radios = root.querySelectorAll('#why-us [data-compose] input[type="radio"]');
    report(radios.length === 5 && radios[0].hasAttribute('checked') && radios.filter((r) => r.hasAttribute('checked')).length === 1, '15 redesign', '/ message builder offers five needs, the first one chosen', `${radios.length} radio(s)`);

    // Sample inspection report: four evidence photos and the stamp, all with alt text.
    const evid = root.querySelectorAll('#why-us .rep-evid img');
    const stamp = root.querySelector('#why-us .rep-foot img');
    report(evid.length === 4 && !!stamp && (stamp.getAttribute('alt') ?? '').includes('083 334 9357'), '15 redesign', '/ sample report has four evidence photos and the stamp', `${evid.length} photo(s), stamp ${stamp ? 'present' : 'MISSING'}`);
    const reportText = visibleText(root.querySelector('#why-us .rep') ?? parse(''));
    report(reportText.includes('Example format, no customer data shown'), '15 redesign', '/ sample report is labelled as an example');

    // Recoveries band.
    const rec = root.querySelector('#recoveries');
    const recText = rec ? visibleText(rec) : '';
    report(squash(rec?.querySelector('h2')?.text ?? '') === 'Stuck far from home?' && recText.includes('Insurance-accredited caravan and trailer recoveries, nationwide and cross-border.'), '15 redesign', '/ recoveries band heading and sentence', recText.slice(0, 90) || 'no #recoveries');
    const plates = (rec?.querySelectorAll('.plates li') ?? []).map((li) => `${squash(li.querySelector('b')?.text ?? '')}=${squash(li.querySelector('span')?.text ?? '')}`);
    report(JSON.stringify(plates) === JSON.stringify(['BW=Botswana', 'MZ=Mozambique', 'ZW=Zimbabwe', 'NA=Namibia', 'SZ=Eswatini']), '15 redesign', '/ recoveries band shows the five country plates', plates.join(' '));
    const recCall = rec?.querySelector(`a[href="${TEL}"]`);
    report(!!recCall && squash(recCall.text) === 'Call 083 334 9357' && !!rec?.querySelector('a[href="/services/recoveries/"]'), '15 redesign', '/ recoveries band has the Call button and the link to the recoveries page');
  }

  // Oracle: the verified workshop hours as the top line prints them (hard-coded, never read from src).
  const TOPBAR_HOURS = 'Mon\u2013Thu 08:00\u201316:00 \u00b7 Fri 08:00\u201314:00';
  for (const route of have) {
    const root = pages.get(route).root;
    const emergency = route === '/services/recoveries/';
    // The fixed bar on small screens replaces the old floating button: WhatsApp (the page's own message, check 12) and Call.
    const bar = root.querySelector('body > .bar');
    const ok = !!bar && !!bar.querySelector(`a.wa-float[href^="${WA}"]`) && !!bar.querySelector(`a[href="${TEL}"]`);
    report(ok, '15 redesign', `${route} fixed bar`, ok ? 'WhatsApp and Call links' : 'no body > .bar with a.wa-float and a tel link');
    // Source order is the reading and Tab order: Call comes first on Recoveries, WhatsApp first everywhere else.
    const first = bar?.querySelector('a');
    const firstIs = !first ? 'none' : first.getAttribute('href') === TEL ? 'Call' : first.classList.contains('wa-float') ? 'WhatsApp' : 'other';
    report(firstIs === (emergency ? 'Call' : 'WhatsApp'), '15 redesign', `${route} fixed bar starts with ${emergency ? 'Call' : 'WhatsApp'} in the markup`, `first link: ${firstIs}`);
    // The top line carries the plain hours as static text. There is no live "open now" line: the weekly hours know
    // nothing about public holidays, so the page must not claim the workshop is open.
    const topText = visibleText(root.querySelector('.topbar') ?? parse(''));
    const hooks = root.querySelectorAll('[data-open-now], [data-hours]').length;
    const claim = visibleText(root).match(/open now|closed now/i);
    report(hooks === 0 && !claim, '15 redesign', `${route} makes no live open or closed claim`, hooks ? `${hooks} [data-open-now]/[data-hours] hook(s)` : claim ? `text says "${claim[0]}"` : '');
    if (emergency) {
      report(topText !== '' && !topText.includes('08:00'), '15 redesign', `${route} top line carries no workshop hours`, topText.slice(0, 80) || 'no .topbar');
    } else {
      report(topText.includes(TOPBAR_HOURS), '15 redesign', `${route} top line carries the hours as static text`, topText.slice(0, 80) || 'no .topbar');
    }
  }
  // No shipped file (page or script) may still hold the live line's wording.
  const liveWording = allFiles.filter((f) => /\.(html|js)$/.test(f) && /Open now until|Closed now\./.test(readFileSync(f, 'utf8'))).map((f) => relative(DIST, f));
  report(liveWording.length === 0, '15 redesign', 'no built page or script carries the live open or closed wording', liveWording.join(', '));
}

// 16. Site redesign, phase 2 (2026-11-14): the service pages, Find us and the 404 page in the Home page's system.
// Every literal here is an oracle typed by hand (the published headlines, the related links, the spec rows), never
// read from src.
{
  const TEL = 'tel:+27833349357';
  // The two display lines of each page headline. Joined by one space they are the headline as it was published.
  const PAGE_HEROES = {
    '/services/caravan-service/': ['Caravan and trailer service', 'in Pretoria North'],
    '/services/repairs/': ['Caravan repairs', 'in Pretoria North'],
    '/services/solar-electrical/': ['Caravan electrical and solar', 'in Pretoria North'],
    '/services/recoveries/': ['Caravan and trailer recoveries,', 'nationwide and cross-border'],
    '/services/lift-kits/': ['50 mm caravan lift kits,', 'fitted in Pretoria North'],
    '/find-us/': ['Find the workshop', 'in Pretoria North'],
  };
  // Related services per page, in the order the page lists them. One related service is a sentence in the closing
  // band (browser-check asserts it), so that page has no rows.
  const RELATED = {
    '/services/caravan-service/': ['/services/repairs/', '/services/solar-electrical/', '/services/lift-kits/'],
    '/services/repairs/': ['/services/caravan-service/', '/services/solar-electrical/', '/services/recoveries/'],
    '/services/solar-electrical/': [],
    '/services/recoveries/': ['/services/repairs/', '/services/caravan-service/'],
    '/services/lift-kits/': ['/services/caravan-service/', '/services/repairs/', '/services/solar-electrical/'],
  };
  const NO_HERO_PHOTO = '/services/recoveries/';
  // Class names of the card system the redesign replaced. None may come back in any built page.
  const OLD_CARDS = ['loc-card', 'loc-item', 'fact', 'chip-list', 'svc', 'price-cards', 'inspection-report', 'report-row', 'step-dot', 'promo', 'hero-panel', 'hero-grid', 'block', 'sec-title', 'notfound-links', 'related-grid'];
  const oldCardsIn = (root) => OLD_CARDS.filter((c) => root.querySelector(`.${c}`));
  const PLATES = ['BW=Botswana', 'MZ=Mozambique', 'ZW=Zimbabwe', 'NA=Namibia', 'SZ=Eswatini'];
  const platesOf = (node) => (node?.querySelectorAll('.plates li') ?? []).map((li) => `${squash(li.querySelector('b')?.text ?? '')}=${squash(li.querySelector('span')?.text ?? '')}`);

  for (const route of have.filter((r) => PAGE_HEROES[r])) {
    const root = pages.get(route).root;
    const [first, second] = PAGE_HEROES[route];
    const hero = root.querySelector('main > header.hero.on-ink');
    const h1 = hero?.querySelector('h1');
    const hi = h1?.querySelectorAll('.hi') ?? [];
    report(!!h1 && squash(h1.text) === `${first} ${second}` && hi.length === 1 && squash(hi[0].text) === second, '16 pages', `${route} hero is the ink field, headline in two lines with the words unchanged`, h1 ? `"${squash(h1.text)}" highlighted: ${hi.map((n) => `"${squash(n.text)}"`).join(', ') || 'none'}` : 'no main > header.hero.on-ink with an h1');
    report(!!hero?.querySelector('nav.crumbs a[href="/"]'), '16 pages', `${route} breadcrumbs sit in the hero`);

    const imgs = root.querySelectorAll('main img');
    const heroImg = hero?.querySelector('.hero-photo img');
    if (route === NO_HERO_PHOTO) {
      report(!heroImg && JSON.stringify(platesOf(hero)) === JSON.stringify(PLATES), '16 pages', `${route} hero carries the five country plates and no photo`, platesOf(hero).join(' ') || 'no .plates in the hero');
    } else {
      const eager = imgs.filter((i) => i.getAttribute('loading') !== 'lazy');
      report(!!heroImg && heroImg.getAttribute('loading') === 'eager' && heroImg.getAttribute('fetchpriority') === 'high' && eager.length === 1 && eager[0] === heroImg, '16 pages', `${route} hero photo is the one eager, high-priority image`, heroImg ? `loading=${heroImg.getAttribute('loading')} fetchpriority=${heroImg.getAttribute('fetchpriority')}; ${eager.length} image(s) in main not lazy` : 'no .hero-photo img');
    }

    const sections = root.querySelectorAll('main > section');
    const notSec = sections.filter((s) => !s.classList.contains('sec')).map((s) => s.getAttribute('id') ?? '?');
    const last = sections.at(-1);
    report(notSec.length === 0 && !!last && last.classList.contains('band') && last.classList.contains('on-ink') && !!last.querySelector('h2'), '16 pages', `${route} sections use the shared section rhythm and end in the ink closing band`, notSec.length ? `not .sec: ${notSec.join(', ')}` : `last section: ${last?.getAttribute('class') ?? 'none'}`);
    const old = oldCardsIn(root);
    report(old.length === 0, '16 pages', `${route} has nothing left of the old card system`, old.map((c) => `.${c}`).join(' '));

    // FAQ: every question row carries the drawn plus and minus; aria-expanded is never baked into the markup (the
    // page's script sets it once it has bound, so it cannot go stale without scripting).
    const summaries = root.querySelectorAll('details.faq-item > summary');
    const noIcon = summaries.filter((s) => s.querySelectorAll('.faq-toggle svg').length !== 2).length;
    const baked = summaries.filter((s) => s.hasAttribute('aria-expanded')).length;
    report(summaries.length > 0 && noIcon === 0 && baked === 0, '16 pages', `${route} FAQ rows carry the plus and minus icons`, `${summaries.length} row(s), ${noIcon} without both icons, ${baked} with aria-expanded baked in`);

    if (RELATED[route]) {
      const rows = root.querySelectorAll('#related a.board-row').map((a) => a.getAttribute('href'));
      report(JSON.stringify(rows) === JSON.stringify(RELATED[route]), '16 pages', `${route} related services are board rows to the other pages`, rows.join(' ') || 'no #related a.board-row');
    }
  }

  const CARAVAN = '/services/caravan-service/';
  if (pages.has(CARAVAN)) {
    const root = pages.get(CARAVAN).root;
    const prices = root.querySelectorAll('#pricing .board .price').map((p) => `${squash(p.querySelector('h3')?.text ?? '')}=${squash(p.querySelector('.amt')?.text ?? '')}`);
    report(JSON.stringify(prices) === JSON.stringify(['Single axle, no brakes=R949from', 'Single axle with brakes=R1 499from', 'Double axle with brakes=R2 299from']), '16 pages', `${CARAVAN} packages are three rows of one price board`, prices.join(' | ') || 'no #pricing .board .price');
    const rep = root.querySelector('#inspection-report .rep');
    const stamp = rep?.querySelector('.rep-foot img');
    report(!!rep && rep.querySelectorAll('.rep-evid img').length === 4 && rep.querySelectorAll('.rep-finding').length === 3 && (stamp?.getAttribute('alt') ?? '').includes('083 334 9357') && visibleText(rep).includes('Example format, no customer data shown'), '16 pages', `${CARAVAN} inspection report is the Home page's job card (three findings, four photos, the stamp, labelled as an example)`, rep ? `${rep.querySelectorAll('.rep-finding').length} finding(s), ${rep.querySelectorAll('.rep-evid img').length} photo(s)` : 'no #inspection-report .rep');
    const steps = root.querySelectorAll('#process ol.steps > li h3').map((h) => squash(h.text));
    report(JSON.stringify(steps) === JSON.stringify(['Message us', 'Inspection', 'Quote', 'The work', 'Sign-off']), '16 pages', `${CARAVAN} process is the five numbered steps`, steps.join(' > ') || 'no #process ol.steps');
    const est = root.querySelector('#pricing [data-estimator]');
    report(!!est && !est.hasAttribute('data-est-ready') && !!est.querySelector('.est-static') && !!est.querySelector('.est-live') && est.querySelectorAll('svg use[href="#i-wa"]').length === 1, '16 pages', `${CARAVAN} estimator ships unbound (its script marks it ready) and its button uses the shared WhatsApp icon`, est ? `data-est-ready ${est.hasAttribute('data-est-ready') ? 'BAKED IN' : 'absent'}` : 'no #pricing [data-estimator]');
  }

  const LIFT = '/services/lift-kits/';
  if (pages.has(LIFT)) {
    const root = pages.get(LIFT).root;
    const specs = root.querySelectorAll('#lift-kit dl.specs > div').map((d) => `${squash(d.querySelector('dt')?.text ?? '')}=${squash(d.querySelector('dd')?.text ?? '')}`);
    report(JSON.stringify(specs) === JSON.stringify(['Lift height=50 mm', 'Fit time=About 1 day', 'Warranty=12 months', 'Fitment=Most models']), '16 pages', `${LIFT} specs are one ruled table`, specs.join(' | ') || 'no #lift-kit dl.specs');
    const alt = root.querySelector('header.hero .hero-photo img')?.getAttribute('alt') ?? '';
    report(alt === 'Jurgens Penta with a 50 mm lift kit fitted at Noord Karavane' && root.querySelectorAll('#lift-kit img').length === 0, '16 pages', `${LIFT} the lift kit photo is the hero photo (shown once)`, alt || 'no hero photo');
  }

  const FIND = '/find-us/';
  if (pages.has(FIND)) {
    const root = pages.get(FIND).root;
    const loc = root.querySelector('#location');
    const hrs = (loc?.querySelectorAll('.find-facts .hrs span') ?? []).map((s) => squash(s.text));
    report(JSON.stringify(hrs) === JSON.stringify(['Mon to Thu', '08:00 to 16:00', 'Fri', '08:00 to 14:00', 'Sat and Sun', 'closed']), '16 pages', `${FIND} hours are a table of day groups and times`, hrs.join(' | ') || 'no #location .find-facts .hrs');
    const facts = (loc?.querySelectorAll('.find-facts > div > dt') ?? []).map((d) => squash(d.text));
    report(JSON.stringify(facts) === JSON.stringify(['Address', 'Workshop hours', 'Call']) && !!loc?.querySelector(`.find-facts a[href="${TEL}"]`), '16 pages', `${FIND} address, hours and the number are one ruled list`, facts.join(' | '));
    const sign = loc?.querySelector('figure.loc-photo img')?.getAttribute('alt') ?? '';
    report(sign.includes('painted Noord Karavane sign') && !!loc?.querySelector('.map-card iframe[title]') && !!loc?.querySelector('.map-card .map-bar a[href*="maps.google.com"]'), '16 pages', `${FIND} street sign photo and the map card with its own Maps link`, sign || 'no figure.loc-photo img');
    const links = (loc?.querySelectorAll('.loc-services a') ?? []).map((a) => a.getAttribute('href'));
    report(JSON.stringify(links) === JSON.stringify(SERVICE_ROUTES), '16 pages', `${FIND} lists the five service pages`, links.join(' '));
  }

  {
    const nf = parse(notFoundRaw);
    const hero = nf.querySelector('main > header.hero.on-ink.notfound');
    const h1 = hero?.querySelector('h1');
    report(!!h1 && squash(h1.text) === 'Page not found.' && squash(h1.querySelector('.hi')?.text ?? '') === 'not found.', '16 pages', '/404.html hero is the ink field with the two-line headline', h1 ? squash(h1.text) : 'no main > header.hero.on-ink.notfound h1');
    report(!!hero?.querySelector('a[href^="https://wa.me/27833349357"]') && !!hero?.querySelector(`a[href="${TEL}"]`) && !!hero?.querySelector('a[href="/"]'), '16 pages', '/404.html hero offers home, WhatsApp and Call');
    const rows = nf.querySelectorAll('main a.board-row').map((a) => a.getAttribute('href'));
    report(JSON.stringify(rows) === JSON.stringify([...SERVICE_ROUTES, '/find-us/']), '16 pages', '/404.html board rows lead to the five service pages and Find us', rows.join(' ') || 'no a.board-row');
    const old = oldCardsIn(nf);
    report(old.length === 0, '16 pages', '/404.html has nothing left of the old card system', old.map((c) => `.${c}`).join(' '));
  }
}

// 17. Review round (2026-11-14): text that reads right with the tags stripped, heading levels, and the hooks the
// two client scripts bind to. Every literal is an oracle typed by hand, never read from src.
{
  // Adjacent inline elements carry a real space between them, so a reader that strips the tags (a search snippet,
  // a screen reader's line, copy and paste) never gets "Mon to Thu08:00".
  const HOURS_TEXT = 'Mon to Thu 08:00 to 16:00 Fri 08:00 to 14:00 Sat and Sun closed';
  for (const route of have) {
    const hrs = pages.get(route).root.querySelectorAll('.hrs').map((n) => squash(n.text));
    report(hrs.length > 0 && hrs.every((t) => t === HOURS_TEXT), '17 plain text', `${route} hours read "Mon to Thu 08:00 ..." with the tags stripped`, hrs.join(' | ') || 'no .hrs');
  }
  for (const route of ['/', '/services/recoveries/'].filter((r) => pages.has(r))) {
    const plates = squash(pages.get(route).root.querySelector('.plates')?.text ?? '');
    report(plates === 'BW Botswana MZ Mozambique ZW Zimbabwe NA Namibia SZ Eswatini', '17 plain text', `${route} country plates read code, space, name`, plates || 'no .plates');
  }
  for (const route of have.filter((r) => r !== '/services/recoveries/')) {
    const top = squash(pages.get(route).root.querySelector('.topbar')?.text ?? '');
    report(top === 'Mon–Thu 08:00–16:00 · Fri 08:00–14:00 Caravan workshop, 252 General Beyers Street, Pretoria North WhatsApp or call 083 334 9357', '17 plain text', `${route} top line reads as three spaced parts, the number once`, top || 'no .topbar');
  }
  if (pages.has('/')) {
    const by = pages.get('/').root.querySelectorAll('#reviews .by').map((n) => squash(n.text));
    const glued = by.filter((t) => !/\S \d{1,2} [A-Z][a-z]+ \d{4}$/.test(t));
    report(by.length > 0 && glued.length === 0, '17 plain text', '/ review bylines read name, space, date', by.join(' | ') || 'no #reviews .by');
  }

  // Heading levels never skip one on the way down (h1 then h3 leaves a screen reader's outline with a hole).
  const outlines = [...have.map((r) => [r, pages.get(r).root]), ['/404.html', parse(notFoundRaw)]];
  for (const [route, root] of outlines) {
    const levels = root.querySelectorAll('h1,h2,h3,h4,h5,h6').map((h) => Number(h.tagName[1]));
    const skips = levels.map((l, i) => (l > (levels[i - 1] ?? 0) + 1 ? `h${levels[i - 1] ?? 0} then h${l}` : null)).filter(Boolean);
    report(levels.length > 0 && skips.length === 0, '17 headings', `${route} heading levels never skip one`, skips.length ? [...new Set(skips)].join(', ') : levels.join(''));
  }

  // Client hooks. Each selector is what a client script looks up (it returns before binding when one is missing,
  // leaving the static fallback), so it must be in the page AND still be the literal the shipped script asks for:
  // a rename on either side alone fails here instead of quietly switching the feature off.
  const shipped = allFiles.filter((f) => /\.(js|html)$/.test(f)).map((f) => readFileSync(f, 'utf8'));
  const HOOKS = [
    ['/services/caravan-service/', '[data-estimator]', ['[data-est-total]', '[data-est-cta]', '[data-axle]', '[data-addon]']],
    ['/', 'form[data-compose]', ['[data-compose-preview]', '[data-compose-status]', '[data-compose-send]', 'input[name="van"]', 'input[name="need"]:checked']],
  ];
  for (const [route, rootSel, hooks] of HOOKS) {
    if (!pages.has(route)) continue;
    const scope = pages.get(route).root.querySelector(rootSel);
    // node-html-parser has no :checked: the checked radio is the one that carries the attribute.
    const inPage = (sel) => (scope ? scope.querySelectorAll(sel.replace(':checked', '[checked]')).length : 0);
    const notInPage = hooks.filter((sel) => inPage(sel) === 0);
    const notInScript = [rootSel, ...hooks].filter((sel) => !shipped.some((src) => src.includes(sel)));
    report(!!scope && notInPage.length === 0, '17 client hooks', `${route} ${rootSel} carries every hook its script binds to`, !scope ? `no ${rootSel}` : notInPage.length ? `not in the page: ${notInPage.join(', ')}` : hooks.join(' '));
    report(notInScript.length === 0, '17 client hooks', `${route} the shipped script still asks for the same selectors`, notInScript.length ? `in no built script: ${notInScript.join(', ')}` : `${hooks.length + 1} selectors found in the build`);
  }
}

if (failures > 0) {
  console.error(`verify: FAIL (${failures})`);
  process.exit(1);
}
console.log('verify: all checks passed');
