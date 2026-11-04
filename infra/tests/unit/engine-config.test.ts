import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const infraRoot = resolve(__dirname, '../..');

/** Recursively list .ts sources under a directory (no node_modules, no tests). */
function sources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      out.push(...sources(path));
      continue;
    }
    if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) out.push(path);
  }
  return out;
}

// The engine reads the app's config only through engine-config, the one engine module that imports the shared package.
describe('config boundary sweep', () => {
  it('no engine module references the shared package except engine-config', () => {
    const scanned = [
      ...sources(join(infraRoot, 'resources')),
      ...sources(join(infraRoot, 'lib')),
      ...sources(join(infraRoot, 'compose')),
      ...sources(join(infraRoot, 'tasks')),
      ...sources(join(infraRoot, 'cli')),
      ...sources(join(infraRoot, 'config')),
      ...sources(join(infraRoot, 'agent', 'src')),
      join(infraRoot, 'pulumi-context.ts'),
      join(infraRoot, 'index.ts'),
    ];
    const offenders: string[] = [];
    for (const file of scanned) {
      if (file.endsWith('config/engine-config.ts')) continue;
      const src = readFileSync(file, 'utf-8');
      // The shared PACKAGE ('shared', 'shared/...') or a relative escape to the workspace's shared dir; cli/shared.ts is a local module and unrelated.
      if (/from\s+'shared(?:'|\/)|from\s+'(?:\.\.\/){2,}shared'|import\('shared'\)/.test(src)) {
        offenders.push(file.replace(`${infraRoot}/`, ''));
      }
    }
    expect(offenders).toEqual([]);
  });

  // The export is read once, when the module first loads: a static import outside the Pulumi program could load it before APP_MODE is set.
  it('only the Pulumi program imports the engine config statically; every other module imports its type or loads it dynamically', () => {
    const staticImport = /^import (?!type )[^;]*from '(?:\.\.?\/)+(?:config\/)?engine-config';/m;
    const scanned = [
      ...sources(join(infraRoot, 'lib')),
      ...sources(join(infraRoot, 'compose')),
      ...sources(join(infraRoot, 'tasks')),
      ...sources(join(infraRoot, 'cli')),
      ...sources(join(infraRoot, 'config')),
      ...sources(join(infraRoot, 'agent', 'src')),
      join(infraRoot, 'index.ts'),
    ];
    const offenders = scanned.filter((file) => staticImport.test(readFileSync(file, 'utf-8')));
    expect(offenders.map((file) => file.replace(`${infraRoot}/`, ''))).toEqual([]);
    // Positive control: the program's context module imports it statically.
    expect(readFileSync(join(infraRoot, 'pulumi-context.ts'), 'utf-8')).toMatch(staticImport);
  });
});
