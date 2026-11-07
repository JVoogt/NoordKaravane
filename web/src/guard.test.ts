import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const GUARD = resolve(__dirname, '..', 'scripts', 'guard.mjs');

function run(args: string[], env: Record<string, string> = {}) {
  // Stop git's repo discovery at the fixture root's parent, so a TMPDIR inside a work tree
  // does not make "no .git at all" resolve to the enclosing repository.
  const ceiling = env.GUARD_WEB ? { GIT_CEILING_DIRECTORIES: dirname(dirname(env.GUARD_WEB)) } : {};
  const r = spawnSync('node', [GUARD, ...args], {
    env: { ...process.env, ...ceiling, ...env },
    encoding: 'utf8',
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

// A throwaway "repo/web" tree so the guard can be pointed at fixtures via GUARD_WEB.
let root: string;
let web: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'guard-'));
  web = join(root, 'web');
  mkdirSync(join(web, 'src'), { recursive: true });
  writeFileSync(join(web, 'src', 'a.ts'), 'export const a = 1;\n'); // a scanned file: an empty tree is a failure
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('guard tracked-file check', () => {
  it('fails (not "ok") when git cannot list files inside a checkout', () => {
    mkdirSync(join(root, '.git')); // marks the fixture as a checkout
    const r = run([], { GUARD_WEB: web, GIT_DIR: '/nonexistent-git-dir' });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/tracked-file check failed/);
    expect(r.out).not.toMatch(/guard: ok/);
  });

  it('warns and still exits 0 when there is no .git at all', () => {
    const r = run([], { GUARD_WEB: web });
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/WARNING tracked-file check skipped \(no \.git\)/);
  });
});

describe('guard --dist', () => {
  it('fails when dist/ is missing', () => {
    const r = run(['--dist'], { GUARD_WEB: web });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/dist\/ missing/);
  });

  it('fails on aggregateRating, 17:00, unspaced prices and an em dash in built output', () => {
    mkdirSync(join(web, 'dist'));
    writeFileSync(join(web, 'dist', 'index.html'), `aggregateRating\n17:00\nR1980\nx${String.fromCharCode(0x2014)}y\n`);
    const r = run(['--dist'], { GUARD_WEB: web });
    expect(r.code).not.toBe(0);
    for (const needle of ['aggregateRating', '17:00', 'R1980', 'em dash']) expect(r.out).toContain(needle);
  });

  it.each(['&mdash;', '&MDASH;', '&#8212;', '&#08212;', '&#x2014;', '&#X2014;', '&#x02014;'])('fails on the em dash entity %s in built output', (entity) => {
    mkdirSync(join(web, 'dist'));
    writeFileSync(join(web, 'dist', 'index.html'), `<p>a ${entity} b</p>`);
    const r = run(['--dist'], { GUARD_WEB: web });
    expect(r.code).not.toBe(0);
    expect(r.out).toContain('em dash entity');
  });

  it('passes on a clean dist', () => {
    mkdirSync(join(web, 'dist'));
    writeFileSync(join(web, 'dist', 'index.html'), '<h1>ok</h1><script type="application/ld+json">{}</script>');
    const r = run(['--dist'], { GUARD_WEB: web });
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/guard:dist: ok \(\d+ files scanned, 1 ld\+json blocks\)/);
  });
});

describe('guard scans something', () => {
  it('source mode fails when no files were scanned, and prints the count otherwise', () => {
    rmSync(join(web, 'src', 'a.ts'));
    const empty = run([], { GUARD_WEB: web });
    expect(empty.code).not.toBe(0);
    expect(empty.out).toMatch(/0 files scanned/);
    expect(empty.out).not.toMatch(/guard: ok/);
    writeFileSync(join(web, 'src', 'a.ts'), 'export const a = 1;\n');
    const ok = run([], { GUARD_WEB: web });
    expect(ok.out).toMatch(/guard: ok \(\d+ files scanned\)/);
  });

  it('--dist fails on an empty dist/', () => {
    mkdirSync(join(web, 'dist'));
    const r = run(['--dist'], { GUARD_WEB: web });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/0 files scanned/);
    expect(r.out).not.toMatch(/guard:dist: ok/);
  });

  it('--dist fails when dist/ has files but no index.html', () => {
    mkdirSync(join(web, 'dist'));
    writeFileSync(join(web, 'dist', 'robots.txt'), 'User-agent: *\n');
    const r = run(['--dist'], { GUARD_WEB: web });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/index\.html/);
  });
});

describe('guard --dist JSON-LD references', () => {
  const page = (graph: unknown[]) =>
    `<h1>x</h1><script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': graph })}</script>`;
  const ORG = 'https://example.test/#org';
  const withPage = (graph: unknown[]) => {
    mkdirSync(join(web, 'dist', 'services'), { recursive: true });
    writeFileSync(join(web, 'dist', 'index.html'), '<h1>ok</h1><script type="application/ld+json">{}</script>');
    writeFileSync(join(web, 'dist', 'services', 'p.html'), page(graph));
    return run(['--dist'], { GUARD_WEB: web });
  };

  it('fails when a provider @id has no typed node in the same graph', () => {
    const r = withPage([{ '@type': 'Service', provider: { '@id': ORG } }]);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/services\/p\.html.*provider.*https:\/\/example\.test\/#org.*not defined/);
  });

  it('fails for seller and publisher references too, and for a node defined with no @type', () => {
    const r = withPage([
      { '@id': ORG, name: 'untyped' },
      { '@type': 'Offer', seller: { '@id': ORG } },
      { '@type': 'WebSite', publisher: { '@id': ORG } },
    ]);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/seller/);
    expect(r.out).toMatch(/publisher/);
  });

  it('passes when the referenced @id is a typed node in the graph', () => {
    const r = withPage([{ '@id': ORG, '@type': ['Organization', 'AutoRepair'], name: 'Org' }, { '@type': 'Service', provider: { '@id': ORG } }]);
    expect(r.code).toBe(0);
  });

  it('a {@type, @id}-only node without a name is a reference, not a definition', () => {
    const bare = withPage([{ '@id': ORG, '@type': 'Organization' }, { '@type': 'Service', provider: { '@id': ORG } }]);
    expect(bare.code).not.toBe(0);
    expect(bare.out).toMatch(/provider.*not defined/);
    rmSync(join(web, 'dist'), { recursive: true, force: true });
    const inline = withPage([{ '@type': 'Service', provider: { '@id': ORG, '@type': 'Organization' } }]);
    expect(inline.code).not.toBe(0);
    expect(inline.out).toMatch(/provider.*not defined/);
  });

  it('fails on unparseable JSON-LD', () => {
    mkdirSync(join(web, 'dist'));
    writeFileSync(join(web, 'dist', 'index.html'), '<script type="application/ld+json">{not json</script>');
    const r = run(['--dist'], { GUARD_WEB: web });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/JSON-LD/);
  });
});

describe('guard --dist requires JSON-LD', () => {
  const LD = '<script type="application/ld+json">{}</script>';
  const tree = (index: string, services: Record<string, string> = {}) => {
    mkdirSync(join(web, 'dist'), { recursive: true });
    writeFileSync(join(web, 'dist', 'index.html'), index);
    for (const [slug, html] of Object.entries(services)) {
      mkdirSync(join(web, 'dist', 'services', slug), { recursive: true });
      writeFileSync(join(web, 'dist', 'services', slug, 'index.html'), html);
    }
    return run(['--dist'], { GUARD_WEB: web });
  };

  it('fails when dist/index.html has no JSON-LD block', () => {
    const r = tree('<h1>ok</h1>');
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/index\.html.*no JSON-LD/);
  });

  it('fails when one service page has none, and names that page', () => {
    const r = tree(LD, { good: LD, bare: '<h1>x</h1>' });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/services\/bare\/index\.html.*no JSON-LD/);
    expect(r.out).not.toMatch(/services\/good\/index\.html.*no JSON-LD/);
  });

  it.each([
    ['single quotes', `<script type='application/ld+json'>{}</script>`],
    ['unquoted', `<script type=application/ld+json>{}</script>`],
    ['upper case', `<script TYPE="Application/LD+JSON">{}</script>`],
    ['extra attributes', `<script id="a" type="application/ld+json" data-x="1">{}</script>`],
  ])('counts a block written with %s', (_name, block) => {
    const r = tree(block);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/1 ld\+json blocks/);
  });

  it.each([
    ['single quotes', `<script type='application/ld+json'>`],
    ['unquoted', `<script type=application/ld+json>`],
    ['upper case', `<script TYPE="APPLICATION/LD+JSON">`],
  ])('still checks references in a block written with %s', (_name, open) => {
    const doc = JSON.stringify({ '@graph': [{ '@type': 'Service', provider: { '@id': 'https://example.test/#org' } }] });
    const r = tree(`${open}${doc}</script>`);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/provider.*not defined/);
  });

  it('counts blocks across files in the summary', () => {
    const r = tree(LD, { a: LD + LD, b: LD });
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/guard:dist: ok \(\d+ files scanned, 4 ld\+json blocks\)/);
  });
});

describe('guard (source) does not depend on dist', () => {
  it('ignores a dirty dist/ in source mode', () => {
    mkdirSync(join(web, 'dist'));
    writeFileSync(join(web, 'dist', 'index.html'), 'aggregateRating');
    const r = run([], { GUARD_WEB: web });
    expect(r.code).toBe(0);
  });
});

describe('guard source em dash entities', () => {
  it.each(['&mdash;', '&#8212;', '&#x2014;'])('fails on %s in a source file', (entity) => {
    writeFileSync(join(web, 'src', 'page.astro'), `<p>a ${entity} b</p>\n`);
    const r = run([], { GUARD_WEB: web });
    expect(r.code).not.toBe(0);
    expect(r.out).toContain('em dash entity');
  });

  it('does not flag the en dash entity', () => {
    writeFileSync(join(web, 'src', 'page.astro'), '<p>a &ndash; b</p>\n');
    expect(run([], { GUARD_WEB: web }).out).not.toContain('em dash entity');
  });
});

describe('guard control characters', () => {
  it('fails on a C1 control character hidden in a CSS escape, and names file and code point', () => {
    writeFileSync(join(web, 'src', 'q.css'), ".q::before { content: '\u0081C'; }\n");
    const r = run([], { GUARD_WEB: web });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/q\.css:1: control character U\+0081/);
  });

  it('allows tabs and normal text', () => {
    writeFileSync(join(web, 'src', 'ok.css'), ".q::before {\tcontent: '\\201C'; }\n");
    const r = run([], { GUARD_WEB: web });
    expect(r.out).not.toMatch(/control character/);
  });
});
