// Repo guard: forbidden strings and files. Plain Node, no imports from src (the literals below are oracles).
// Scope is web/src, web/scripts, web/public, web/dist only. It never reaches config/ or any business.json.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, extname, basename, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

// GUARD_WEB lets the tests point the guard at a throwaway tree.
const WEB = process.env.GUARD_WEB ? resolve(process.env.GUARD_WEB) : resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST_MODE = process.argv.includes('--dist');
const EM_DASH = String.fromCharCode(0x2014);
const TEXT_EXT = new Set(['.ts', '.mjs', '.js', '.astro', '.md', '.css', '.json', '.html', '.txt', '.xml', '.svg']);
const FORBIDDEN = ['17:00', 'Mon-Fri 08', 'Mon–Fri', 'Mon to Fri', 'aggregateRating', 'business.json'];
const UNSPACED_PRICES = ['R1980', 'R1499', 'R2299'];

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (TEXT_EXT.has(extname(name))) out.push(p);
  }
  return out;
}

const failures = [];
let scanned = 0; // files read by the scan in this mode; zero means the guard looked at nothing
let ldBlocks = 0; // JSON-LD blocks found in built pages (dist mode)
function scan(files, needles, label) {
  for (const f of files) {
    const lines = readFileSync(f, 'utf8').split('\n');
    lines.forEach((line, i) => {
      for (const n of needles) {
        if (line.includes(n)) failures.push(`${relative(WEB, f)}:${i + 1}: ${label} ${JSON.stringify(n)}`);
      }
    });
  }
}

// The em dash also hides as an HTML entity: &mdash; or a decimal or hex numeric reference, any case, any zero padding.
const EM_DASH_ENTITY = /&(?:mdash|#0*8212|#x0*2014);/i;
function scanEntity(files) {
  for (const f of files) {
    readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      const m = line.match(EM_DASH_ENTITY);
      if (m) failures.push(`${relative(WEB, f)}:${i + 1}: em dash entity ${JSON.stringify(m[0])}`);
    });
  }
}

// Every provider/seller/publisher @id a page's JSON-LD points at must be DEFINED in the same graph; a bare
// reference to an undefined node tells search engines nothing. A definition carries at least @id, @type and
// name: a {@type, @id}-only node used as a provider/seller/publisher is still just a reference.
const REF_KEYS = new Set(['provider', 'seller', 'publisher']);
// The type attribute may be upper case and may be double-quoted, single-quoted or unquoted.
const LD_BLOCK = /<script\b[^>]*?\btype\s*=\s*(?:"application\/ld\+json"|'application\/ld\+json'|application\/ld\+json(?=[\s>]))[^>]*>([\s\S]*?)<\/script>/gi;
function checkJsonLdRefs(file, required) {
  const html = readFileSync(file, 'utf8');
  const blocks = [...html.matchAll(LD_BLOCK)];
  ldBlocks += blocks.length;
  if (required && blocks.length === 0) failures.push(`${relative(WEB, file)}: no JSON-LD block (every page must ship one)`);
  blocks.forEach((m, n) => {
    let doc;
    try {
      doc = JSON.parse(m[1]);
    } catch (e) {
      failures.push(`${relative(WEB, file)}: unparseable JSON-LD block ${n + 1}: ${e.message}`);
      return;
    }
    const defined = new Set();
    const refs = [];
    const visit = (v, key) => {
      if (Array.isArray(v)) return v.forEach((x) => visit(x, key));
      if (!v || typeof v !== 'object') return;
      if (v['@id'] && v['@type'] && v.name) defined.add(v['@id']);
      else if (v['@id'] && REF_KEYS.has(key)) refs.push({ key, id: v['@id'] });
      for (const [k, x] of Object.entries(v)) visit(x, k);
    };
    visit(doc);
    for (const r of refs) {
      if (!defined.has(r.id)) failures.push(`${relative(WEB, file)}: ${r.key} ${r.id} is not defined (needs @id, @type and name) in the same JSON-LD graph`);
    }
  });
}

if (DIST_MODE) {
  // Built output. dist/ MUST exist: a missing build is a failure, never a silent skip.
  const dist = join(WEB, 'dist');
  if (!existsSync(dist)) {
    console.error('guard:dist: FAIL dist/ missing (run the build first)');
    process.exit(1);
  }
  const distFiles = walk(dist);
  scanned = distFiles.length;
  // An empty or partial dist is a broken build, not a clean one.
  if (!distFiles.some((f) => f === join(dist, 'index.html'))) failures.push('dist/index.html not found among the scanned files');
  // The home page and every service page must carry JSON-LD; other pages are checked when they have it.
  const requiresLd = (f) => f === join(dist, 'index.html') || /^services\/[^/]+\/index\.html$/.test(relative(dist, f).split('\\').join('/'));
  distFiles.filter((f) => f.endsWith('.html')).forEach((f) => checkJsonLdRefs(f, requiresLd(f)));
  scan(distFiles, [EM_DASH], 'em dash');
  scanEntity(distFiles);
  scan(distFiles, ['aggregateRating', '17:00', ...UNSPACED_PRICES], 'forbidden');
  report('guard:dist');
}

// U+2014 anywhere in src, scripts, public text files.
const srcFiles = walk(join(WEB, 'src'));
const emDashFiles = [...srcFiles, ...['scripts', 'public'].flatMap((d) => walk(join(WEB, d)))];
scanned = srcFiles.length;
scan(emDashFiles, [EM_DASH], 'em dash');

// String checks on source (excluding tests). Scripts hold the literals as oracles.
const stringFiles = walk(join(WEB, 'src')).filter((f) => !f.endsWith('.test.ts'));
scan(stringFiles, [...FORBIDDEN, ...UNSPACED_PRICES], 'forbidden');
scanEntity([...stringFiles, ...walk(join(WEB, 'public'))]);

// Tracked files under web/ or docker/ named business.json or business.*.json.
let tracked = [];
const repo = resolve(WEB, '..');
try {
  tracked = execFileSync('git', ['ls-files', 'web', 'docker'], { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    .split('\n')
    .filter(Boolean);
} catch (e) {
  if (existsSync(join(repo, '.git'))) {
    failures.push(`tracked-file check failed in a git checkout: ${String(e.message).split('\n')[0]}`);
  } else {
    console.warn('guard: WARNING tracked-file check skipped (no .git)');
  }
}
for (const f of tracked) {
  const b = basename(f);
  if (b === 'business.json' || /^business\..+\.json$/.test(b)) failures.push(`${f}: tracked business file`);
}

report('guard');

function report(label) {
  if (scanned === 0) failures.push(`${label}: 0 files scanned (missing or empty tree)`);
  if (failures.length) {
    console.error(failures.join('\n'));
    console.error(`${label}: FAIL (${failures.length})`);
    process.exit(1);
  }
  console.log(`${label}: ok (${scanned} files scanned${DIST_MODE ? `, ${ldBlocks} ld+json blocks` : ''})`);
  if (DIST_MODE) process.exit(0);
}
