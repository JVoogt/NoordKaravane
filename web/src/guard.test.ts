import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const GUARD = resolve(__dirname, '..', 'scripts', 'guard.mjs');

function run(args: string[], env: Record<string, string> = {}) {
  const r = spawnSync('node', [GUARD, ...args], {
    env: { ...process.env, ...env },
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

describe('guard (source) does not depend on dist', () => {
  it('ignores a dirty dist/ in source mode', () => {
    mkdirSync(join(web, 'dist'));
    writeFileSync(join(web, 'dist', 'index.html'), 'aggregateRating');
    const r = run([], { GUARD_WEB: web });
    expect(r.code).toBe(0);
  });
});
