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

  it('passes on a clean dist', () => {
    mkdirSync(join(web, 'dist'));
    writeFileSync(join(web, 'dist', 'index.html'), '<h1>ok</h1>');
    const r = run(['--dist'], { GUARD_WEB: web });
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/guard:dist: ok/);
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
    writeFileSync(join(web, 'dist', 'index.html'), '<h1>ok</h1>');
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
    const r = withPage([{ '@id': ORG, '@type': ['Organization', 'AutoRepair'] }, { '@type': 'Service', provider: { '@id': ORG } }]);
    expect(r.code).toBe(0);
  });

  it('fails on unparseable JSON-LD', () => {
    mkdirSync(join(web, 'dist'));
    writeFileSync(join(web, 'dist', 'index.html'), '<script type="application/ld+json">{not json</script>');
    const r = run(['--dist'], { GUARD_WEB: web });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/JSON-LD/);
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
