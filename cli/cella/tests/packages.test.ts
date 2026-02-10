/**
 * Unit tests for package.json merge logic.
 *
 * Tests the mergeDeps function behavior via the syncPackageJson flow
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
    fs.writeFileSync(path.join(upstreamPath, 'package.json'), JSON.stringify(upstreamPkg, null, 2) + '\n');
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

  it('should update existing dependency versions from upstream', async () => {
    // Bump version in upstream
    const upstreamPkg = readPkg(upstreamPath);
    (upstreamPkg.dependencies as Record<string, string>).hono = '^5.0.0';
    fs.writeFileSync(path.join(upstreamPath, 'package.json'), JSON.stringify(upstreamPkg, null, 2) + '\n');
    exec('git add -A && git commit -m "bump hono"', upstreamPath);
    exec('git fetch cella-upstream', forkPath);

    await runPackages(buildConfig());

    const forkPkg = readPkg(forkPath);
    const deps = forkPkg.dependencies as Record<string, string>;
    expect(deps.hono).toBe('^5.0.0');
  });

  it('should preserve fork-only dependencies', async () => {
    // Add fork-only dependency
    const forkPkg = readPkg(forkPath);
    (forkPkg.dependencies as Record<string, string>)['my-custom-lib'] = '^1.0.0';
    fs.writeFileSync(path.join(forkPath, 'package.json'), JSON.stringify(forkPkg, null, 2) + '\n');
    exec('git add -A && git commit -m "add custom lib"', forkPath);

    // Make an upstream change to trigger merge
    const upstreamPkg = readPkg(upstreamPath);
    (upstreamPkg.devDependencies as Record<string, string>).biome = '^1.5.0';
    fs.writeFileSync(path.join(upstreamPath, 'package.json'), JSON.stringify(upstreamPkg, null, 2) + '\n');
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

  it('should sort dependencies alphabetically after merge', async () => {
    // Add a dependency that comes first alphabetically in upstream
    const upstreamPkg = readPkg(upstreamPath);
    (upstreamPkg.dependencies as Record<string, string>).axios = '^1.6.0';
    fs.writeFileSync(path.join(upstreamPath, 'package.json'), JSON.stringify(upstreamPkg, null, 2) + '\n');
    exec('git add -A && git commit -m "add axios"', upstreamPath);
    exec('git fetch cella-upstream', forkPath);

    await runPackages(buildConfig());

    const forkPkg = readPkg(forkPath);
    const depKeys = Object.keys(forkPkg.dependencies as Record<string, string>);
    const sorted = [...depKeys].sort((a, b) => a.localeCompare(b));
    expect(depKeys).toEqual(sorted);
  });

  it('should sync scripts from upstream when configured', async () => {
    // Add a new script in upstream
    const upstreamPkg = readPkg(upstreamPath);
    upstreamPkg.scripts = { build: 'tsc', test: 'vitest' };
    fs.writeFileSync(path.join(upstreamPath, 'package.json'), JSON.stringify(upstreamPkg, null, 2) + '\n');
    exec('git add -A && git commit -m "add scripts"', upstreamPath);
    exec('git fetch cella-upstream', forkPath);

    // scripts is not in default packageJsonSync, must be explicitly included
    await runPackages(buildConfig({ packageJsonSync: ['dependencies', 'devDependencies', 'scripts'] }));

    const forkPkg = readPkg(forkPath);
    const scripts = forkPkg.scripts as Record<string, string>;
    expect(scripts.build).toBe('tsc');
    expect(scripts.test).toBe('vitest');
  });
});
