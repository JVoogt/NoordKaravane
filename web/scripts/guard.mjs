// Repo guard: forbidden strings and files. Plain Node, no imports from src (the literals below are oracles).
// Scope is web/src, web/scripts, web/public, web/dist only. It never reaches config/ or any business.json.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, extname, basename, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
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

// U+2014 anywhere in src, scripts, public text files.
const emDashFiles = ['src', 'scripts', 'public'].flatMap((d) => walk(join(WEB, d)));
scan(emDashFiles, [EM_DASH], 'em dash');

// String checks: src (excluding tests) and dist when present. Scripts hold the literals as oracles.
const stringFiles = [...walk(join(WEB, 'src')).filter((f) => !f.endsWith('.test.ts')), ...walk(join(WEB, 'dist'))];
scan(stringFiles, [...FORBIDDEN, ...UNSPACED_PRICES], 'forbidden');

// Tracked files under web/ or docker/ named business.json or business.*.json.
let tracked = [];
try {
  tracked = execFileSync('git', ['ls-files', 'web', 'docker'], { cwd: resolve(WEB, '..'), encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
} catch {
  // not a git checkout (for example inside the Docker build stage): nothing to list
}
for (const f of tracked) {
  const b = basename(f);
  if (b === 'business.json' || /^business\..+\.json$/.test(b)) failures.push(`${f}: tracked business file`);
}

if (failures.length) {
  console.error(failures.join('\n'));
  console.error(`guard: FAIL (${failures.length})`);
  process.exit(1);
}
console.log('guard: ok');
