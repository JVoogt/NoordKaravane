// Storefront guard (plan Task 2.3, DD12): no em dash anywhere in the storefront, and no raw-number prices in Kampi
// copy. Plain Node, no imports from src. Same em dash rules as web/scripts/guard.mjs.
// Scope: storefront/src, storefront/public (text files) and storefront/scripts. GUARD_ROOT points it at a test tree.
// Also: every {{token}} in Kampi copy resolves against ../config/business.example.json (GUARD_BUSINESS_EXAMPLE
// overrides the path; the Docker build stage copies it to /config). Runs before every `npm run build`.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, extname, resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.GUARD_ROOT ? resolve(process.env.GUARD_ROOT) : resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EM_DASH = String.fromCharCode(0x2014);
// The em dash also hides as an HTML entity: the named one (mdash) or a decimal or hex numeric reference, any case,
// any zero padding.
const EM_DASH_ENTITY = /&(?:mdash|#0*8212|#x0*2014);/i;
// Kampi copy writes prices through zar() or {{zar:key}}: never R and four unspaced digits, a comma-grouped amount or
// R before a {{key}} placeholder (DD12, G33).
const RAW_PRICE = [/R\d{4,}/, /R\d{1,3},\d{3}/, /R\{\{/];
const TEXT_EXT = new Set(['.ts', '.tsx', '.mjs', '.js', '.astro', '.md', '.mdx', '.css', '.json', '.html', '.txt', '.xml', '.svg']);

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

const rel = (f) => relative(ROOT, f).split(sep).join('/');
const isKampiFile = (r) => r.startsWith('src/content/kampi/') || r.startsWith('src/brands/kampi/');

/** Line numbers (1-based) of the `kampi: { ... }` entry inside STORE_BRANDS in src/lib/brands.ts. */
function kampiBlockLines(lines) {
  const start = lines.findIndex((l) => /export const STORE_BRANDS\b/.test(l));
  if (start < 0) return new Set();
  const open = lines.findIndex((l, i) => i > start && /^\s*kampi:\s*\{/.test(l));
  if (open < 0) return new Set();
  const indent = lines[open].match(/^\s*/)[0];
  const out = new Set();
  for (let i = open; i < lines.length; i++) {
    out.add(i + 1);
    if (i > open && lines[i].startsWith(indent + '}')) break;
  }
  return out;
}

// Kampi content, components and brand copy fill {{key}} and {{zar:key}} from business.json (src/lib/fill.ts). Every
// token there must resolve against the example config's shape: zar to a finite number, plain to a string or number.
// Same token pattern as fill.ts, so an Astro object literal ({{ a: 1 }}) is not a token.
const TOKEN = /\{\{\s*(zar:)?([a-z_][a-z0-9_.]*)\s*\}\}/gi;
const hasTokens = (r) => isKampiFile(r) || r.startsWith('src/components/kampi/');
const EXAMPLE_PATH = process.env.GUARD_BUSINESS_EXAMPLE ? resolve(process.env.GUARD_BUSINESS_EXAMPLE) : resolve(ROOT, '..', 'config', 'business.example.json');
let example = null;
try {
  example = JSON.parse(readFileSync(EXAMPLE_PATH, 'utf8'));
} catch (e) {
  console.error(`storefront guard: cannot read ${EXAMPLE_PATH} to resolve Kampi {{tokens}} (${e.code || e.message})`);
  process.exit(1);
}
const lookup = (dotted) => dotted.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), example);
function tokenProblem(zarToken, key) {
  const v = lookup(key);
  if (zarToken) return typeof v === 'number' && Number.isFinite(v) ? null : `{{zar:${key}}} is not a number in business.example.json`;
  return typeof v === 'string' || typeof v === 'number' ? null : `unresolved token {{${key}}} (no string or number in business.example.json)`;
}

const failures = [];
let tokens = 0;
const files = ['src', 'public', 'scripts'].flatMap((d) => walk(join(ROOT, d)));
for (const f of files) {
  const r = rel(f);
  const lines = readFileSync(f, 'utf8').split('\n');
  const kampiLines = r === 'src/lib/brands.ts' ? kampiBlockLines(lines) : null;
  // Without the block the raw-price check would silently skip every Kampi line in brands.ts.
  if (kampiLines && kampiLines.size === 0) failures.push(`${r}: kampi block not found in STORE_BRANDS (guard cannot check its prices)`);
  lines.forEach((line, i) => {
    if (hasTokens(r)) {
      for (const t of line.matchAll(TOKEN)) {
        tokens++;
        const p = tokenProblem(!!t[1], t[2]);
        if (p) failures.push(`${r}:${i + 1}: ${p}`);
      }
    }
    if (line.includes(EM_DASH)) failures.push(`${r}:${i + 1}: em dash`);
    const m = line.match(EM_DASH_ENTITY);
    if (m) failures.push(`${r}:${i + 1}: em dash entity ${JSON.stringify(m[0])}`);
    if (isKampiFile(r) || kampiLines?.has(i + 1)) {
      for (const rx of RAW_PRICE) {
        const p = line.match(rx);
        if (p) failures.push(`${r}:${i + 1}: raw price ${JSON.stringify(p[0])} (use zar() or {{zar:key}})`);
      }
    }
  });
}

if (files.length === 0) {
  console.error(`storefront guard: scanned 0 files under ${ROOT} (src, public, scripts)`);
  process.exit(1);
}
if (failures.length) {
  for (const f of failures) console.error(f);
  console.error(`storefront guard: ${failures.length} problem(s) in ${files.length} files`);
  process.exit(1);
}
console.log(`storefront guard: clean (${files.length} files, ${tokens} Kampi tokens resolved)`);
