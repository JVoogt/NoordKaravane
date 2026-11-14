// Storefront guard (plan Task 2.3, DD12): no em dash anywhere in the storefront, and no raw-number prices in Kampi
// copy. Plain Node, no imports from src. Same em dash rules as web/scripts/guard.mjs.
// Scope: storefront/src, storefront/public (text files) and storefront/scripts. GUARD_ROOT points it at a test tree.
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

const failures = [];
const files = ['src', 'public', 'scripts'].flatMap((d) => walk(join(ROOT, d)));
for (const f of files) {
  const r = rel(f);
  const lines = readFileSync(f, 'utf8').split('\n');
  const kampiLines = r === 'src/lib/brands.ts' ? kampiBlockLines(lines) : null;
  lines.forEach((line, i) => {
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
console.log(`storefront guard: clean (${files.length} files)`);
