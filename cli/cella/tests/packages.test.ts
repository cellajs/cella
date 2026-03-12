/**
 * Unit tests for package.json merge logic.
 *
 * Tests the safe merge behavior (add-only, bump-only, never remove/downgrade)
 * using real git repos with package.json files.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PackageJsonSyncKey, RuntimeConfig } from '../src/config/types';
import { runPackages } from '../src/services/packages';

/** Execute a shell command in a directory */
function exec(cmd: string, cwd?: string): string {
  return execSync(cmd, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

/** Read and parse package.json from a path */
function readPkg(dir: string, relativePath = ''): Record<string, unknown> {
  const fullPath = path.join(dir, relativePath, 'package.json');
  return JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
}

/** Write package.json to a path */
function writePkg(dir: string, data: Record<string, unknown>, relativePath = ''): void {
  const fullPath = path.join(dir, relativePath, 'package.json');
  fs.writeFileSync(fullPath, JSON.stringify(data, null, 2) + '\n');
}

describe('packages merge', () => {
  let testDir: string;
  let upstreamPath: string;
  let forkPath: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cella-pkg-test-'));
    upstreamPath = path.join(testDir, 'upstream');
    forkPath = path.join(testDir, 'fork');

    // Create upstream repo with root package.json
    fs.mkdirSync(upstreamPath);
    exec('git init', upstreamPath);
    exec('git config user.email "test@test.com" && git config user.name "Test"', upstreamPath);

    const rootPkg = {
      name: 'test-upstream',
      version: '1.0.0',
      dependencies: {
        hono: '^4.0.0',
        zod: '^3.22.0',
      },
      devDependencies: {
        vitest: '^1.0.0',
        typescript: '^5.3.0',
      },
    };
    fs.writeFileSync(path.join(upstreamPath, 'package.json'), JSON.stringify(rootPkg, null, 2) + '\n');
    exec('git add -A && git commit -m "initial"', upstreamPath);

    // Clone as fork
    exec(`git clone ${upstreamPath} ${forkPath}`);
    exec('git config user.email "test@test.com" && git config user.name "Test"', forkPath);
    exec('git remote rename origin cella-upstream', forkPath);
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  /** Build a RuntimeConfig for the packages service */
  function buildConfig(options?: { packageJsonSync?: PackageJsonSyncKey[] }): RuntimeConfig {
    return {
      settings: {
        upstreamUrl: upstreamPath,
        upstreamBranch: 'main',
        forkBranch: 'main',
        mergeStrategy: 'squash',
        ...(options?.packageJsonSync ? { packageJsonSync: options.packageJsonSync } : {}),
      },
      overrides: { pinned: [], ignored: [] },
      forkPath,
      upstreamRef: 'cella-upstream/main',
      service: 'packages',
      logFile: false,
      list: false,
      verbose: false,
    };
  }

  it('should add new dependencies from upstream', async () => {
    // Add new dependency in upstream
    const upstreamPkg = readPkg(upstreamPath);
    (upstreamPkg.dependencies as Record<string, string>).drizzle = '^0.30.0';
    writePkg(upstreamPath, upstreamPkg);
    exec('git add -A && git commit -m "add drizzle"', upstreamPath);
    exec('git fetch cella-upstream', forkPath);

    await runPackages(buildConfig());

    const forkPkg = readPkg(forkPath);
    const deps = forkPkg.dependencies as Record<string, string>;
    expect(deps.drizzle).toBe('^0.30.0');
    // Existing deps should still be there
    expect(deps.hono).toBe('^4.0.0');
    expect(deps.zod).toBe('^3.22.0');
  });

  it('should bump dependency versions from upstream (never downgrade)', async () => {
    // Bump version in upstream
    const upstreamPkg = readPkg(upstreamPath);
    (upstreamPkg.dependencies as Record<string, string>).hono = '^5.0.0';
    writePkg(upstreamPath, upstreamPkg);
    exec('git add -A && git commit -m "bump hono"', upstreamPath);
    exec('git fetch cella-upstream', forkPath);

    await runPackages(buildConfig());

    const forkPkg = readPkg(forkPath);
    const deps = forkPkg.dependencies as Record<string, string>;
    expect(deps.hono).toBe('^5.0.0');
  });

  it('should never downgrade dependency versions', async () => {
    // Fork has a higher version than upstream
    const forkPkg = readPkg(forkPath);
    (forkPkg.dependencies as Record<string, string>).hono = '^6.0.0';
    writePkg(forkPath, forkPkg);
    exec('git add -A && git commit -m "bump hono in fork"', forkPath);

    // Upstream still has ^4.0.0 — should NOT downgrade fork's ^6.0.0
    exec('git fetch cella-upstream', forkPath);

    await runPackages(buildConfig());

    const resultPkg = readPkg(forkPath);
    const deps = resultPkg.dependencies as Record<string, string>;
    expect(deps.hono).toBe('^6.0.0');
  });

  it('should never remove fork-only dependencies', async () => {
    // Add fork-only dependency
    const forkPkg = readPkg(forkPath);
    (forkPkg.dependencies as Record<string, string>)['my-custom-lib'] = '^1.0.0';
    writePkg(forkPath, forkPkg);
    exec('git add -A && git commit -m "add custom lib"', forkPath);

    // Make an upstream change to trigger merge
    const upstreamPkg = readPkg(upstreamPath);
    (upstreamPkg.devDependencies as Record<string, string>).biome = '^1.5.0';
    writePkg(upstreamPath, upstreamPkg);
    exec('git add -A && git commit -m "add biome"', upstreamPath);
    exec('git fetch cella-upstream', forkPath);

    await runPackages(buildConfig());

    const resultPkg = readPkg(forkPath);
    const deps = resultPkg.dependencies as Record<string, string>;
    // Fork-only dep should still be there
    expect(deps['my-custom-lib']).toBe('^1.0.0');
    // Upstream deps should also be there
    expect(deps.hono).toBe('^4.0.0');
  });

  it('should preserve fork deps even when upstream removes them', async () => {
    // Fork has the dep from upstream
    exec('git fetch cella-upstream', forkPath);

    // Upstream removes the dep
    const upstreamPkg = readPkg(upstreamPath);
    delete (upstreamPkg.dependencies as Record<string, string>).zod;
    writePkg(upstreamPath, upstreamPkg);
    exec('git add -A && git commit -m "remove zod"', upstreamPath);
    exec('git fetch cella-upstream', forkPath);

    await runPackages(buildConfig());

    const resultPkg = readPkg(forkPath);
    const deps = resultPkg.dependencies as Record<string, string>;
    // Fork should still have zod — never remove
    expect(deps.zod).toBe('^3.22.0');
  });

  it('should sort dependencies alphabetically after merge', async () => {
    // Add a dependency that comes first alphabetically in upstream
    const upstreamPkg = readPkg(upstreamPath);
    (upstreamPkg.dependencies as Record<string, string>).axios = '^1.6.0';
    writePkg(upstreamPath, upstreamPkg);
    exec('git add -A && git commit -m "add axios"', upstreamPath);
    exec('git fetch cella-upstream', forkPath);

    await runPackages(buildConfig());

    const forkPkg = readPkg(forkPath);
    const depKeys = Object.keys(forkPkg.dependencies as Record<string, string>);
    const sorted = [...depKeys].sort((a, b) => a.localeCompare(b));
    expect(depKeys).toEqual(sorted);
  });

  it('should add new scripts from upstream but not overwrite fork scripts', async () => {
    // Fork has a custom script
    const forkPkg = readPkg(forkPath);
    forkPkg.scripts = { build: 'my-custom-build', lint: 'my-linter' };
    writePkg(forkPath, forkPkg);
    exec('git add -A && git commit -m "add fork scripts"', forkPath);

    // Upstream has scripts — some overlap, some new
    const upstreamPkg = readPkg(upstreamPath);
    upstreamPkg.scripts = { build: 'tsc', test: 'vitest' };
    writePkg(upstreamPath, upstreamPkg);
    exec('git add -A && git commit -m "add scripts"', upstreamPath);
    exec('git fetch cella-upstream', forkPath);

    await runPackages(buildConfig({ packageJsonSync: ['dependencies', 'devDependencies', 'scripts'] }));

    const resultPkg = readPkg(forkPath);
    const scripts = resultPkg.scripts as Record<string, string>;
    // Fork's existing scripts should be preserved (not overwritten)
    expect(scripts.build).toBe('my-custom-build');
    expect(scripts.lint).toBe('my-linter');
    // New script from upstream should be added
    expect(scripts.test).toBe('vitest');
  });

  it('should merge pnpm.overrides with add/bump-only logic', async () => {
    // Fork has pnpm overrides
    const forkPkg = readPkg(forkPath);
    forkPkg.pnpm = {
      overrides: {
        'esbuild@<=0.24.2': '>=0.25.0',
        'fork-only-pkg@<1.0.0': '>=1.0.0',
      },
    };
    writePkg(forkPath, forkPkg);
    exec('git add -A && git commit -m "add pnpm overrides"', forkPath);

    // Upstream has pnpm overrides — some overlap, some new
    const upstreamPkg = readPkg(upstreamPath);
    upstreamPkg.pnpm = {
      overrides: {
        'esbuild@<=0.24.2': '>=0.26.0', // bump
        'hono@<4.12.7': '>=4.12.7', // new
      },
    };
    writePkg(upstreamPath, upstreamPkg);
    exec('git add -A && git commit -m "add pnpm overrides"', upstreamPath);
    exec('git fetch cella-upstream', forkPath);

    await runPackages(buildConfig({ packageJsonSync: ['dependencies', 'devDependencies', 'pnpm'] }));

    const resultPkg = readPkg(forkPath);
    const overrides = (resultPkg.pnpm as Record<string, unknown>).overrides as Record<string, string>;
    // Bumped from upstream
    expect(overrides['esbuild@<=0.24.2']).toBe('>=0.26.0');
    // New from upstream
    expect(overrides['hono@<4.12.7']).toBe('>=4.12.7');
    // Fork-only preserved
    expect(overrides['fork-only-pkg@<1.0.0']).toBe('>=1.0.0');
  });

  it('should merge pnpm.patchedDependencies add-only', async () => {
    // Fork has a patch
    const forkPkg = readPkg(forkPath);
    forkPkg.pnpm = {
      patchedDependencies: {
        'slugify@1.6.6': 'patches/slugify@1.6.6.patch',
      },
    };
    writePkg(forkPath, forkPkg);
    exec('git add -A && git commit -m "add fork patch"', forkPath);

    // Upstream has a different patch
    const upstreamPkg = readPkg(upstreamPath);
    upstreamPkg.pnpm = {
      patchedDependencies: {
        'dexie@4.3.0': 'patches/dexie@4.3.0.patch',
      },
    };
    writePkg(upstreamPath, upstreamPkg);
    exec('git add -A && git commit -m "add upstream patch"', upstreamPath);
    exec('git fetch cella-upstream', forkPath);

    await runPackages(buildConfig({ packageJsonSync: ['dependencies', 'devDependencies', 'pnpm'] }));

    const resultPkg = readPkg(forkPath);
    const patched = (resultPkg.pnpm as Record<string, unknown>).patchedDependencies as Record<string, string>;
    // Both patches should be present
    expect(patched['slugify@1.6.6']).toBe('patches/slugify@1.6.6.patch');
    expect(patched['dexie@4.3.0']).toBe('patches/dexie@4.3.0.patch');
  });

  it('should merge pnpm.packageExtensions add-only', async () => {
    // Fork has a package extension
    const forkPkg = readPkg(forkPath);
    forkPkg.pnpm = {
      packageExtensions: {
        '@hookform/resolvers@5.2.2': {
          peerDependencies: { zod: '*' },
        },
      },
    };
    writePkg(forkPath, forkPkg);
    exec('git add -A && git commit -m "add fork pkg ext"', forkPath);

    // Upstream has a different package extension
    const upstreamPkg = readPkg(upstreamPath);
    upstreamPkg.pnpm = {
      packageExtensions: {
        'some-lib@1.0.0': {
          peerDependencies: { react: '*' },
        },
      },
    };
    writePkg(upstreamPath, upstreamPkg);
    exec('git add -A && git commit -m "add upstream pkg ext"', upstreamPath);
    exec('git fetch cella-upstream', forkPath);

    await runPackages(buildConfig({ packageJsonSync: ['dependencies', 'devDependencies', 'pnpm'] }));

    const resultPkg = readPkg(forkPath);
    const exts = (resultPkg.pnpm as Record<string, unknown>).packageExtensions as Record<string, unknown>;
    // Both extensions should be present
    expect(exts['@hookform/resolvers@5.2.2']).toEqual({ peerDependencies: { zod: '*' } });
    expect(exts['some-lib@1.0.0']).toEqual({ peerDependencies: { react: '*' } });
  });

  it('should dynamically discover package.json locations', async () => {
    // Create a sub-package in upstream
    const subDir = path.join(upstreamPath, 'frontend');
    fs.mkdirSync(subDir, { recursive: true });
    writePkg(upstreamPath, { name: 'test-frontend', dependencies: { react: '^18.0.0' } }, 'frontend');
    exec('git add -A && git commit -m "add frontend pkg"', upstreamPath);

    // Create matching sub-package in fork
    const forkSubDir = path.join(forkPath, 'frontend');
    fs.mkdirSync(forkSubDir, { recursive: true });
    writePkg(forkPath, { name: 'test-frontend', dependencies: {} }, 'frontend');
    exec('git add -A && git commit -m "add frontend pkg"', forkPath);
    exec('git fetch cella-upstream', forkPath);

    await runPackages(buildConfig());

    // Check frontend package.json was synced
    const frontendPkg = readPkg(forkPath, 'frontend');
    const deps = frontendPkg.dependencies as Record<string, string>;
    expect(deps.react).toBe('^18.0.0');
  });
});
