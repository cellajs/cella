import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import packageJson from '../package.json' with { type: 'json' };

describe('release artifact', () => {
  it('packs the built CLI entrypoints into the npm tarball', () => {
    const output = execFileSync('npm', ['pack', '--dry-run', '--json'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });

    const [packResult] = JSON.parse(output) as Array<{
      files: Array<{ path: string }>;
      name: string;
      version: string;
    }>;

    const packedFiles = new Set(packResult.files.map((file) => file.path));

    expect(packResult.name).toBe(packageJson.name);
    expect(packResult.version).toBe(packageJson.version);
    expect(packedFiles).toContain('index.js');
    expect(packedFiles).toContain('dist/index.js');
    expect(packedFiles).toContain('package.json');
  });

  it('keeps container isolation and port offset replacements in the built CLI', () => {
    const builtEntry = readFileSync(new URL('../dist/index.js', import.meta.url), 'utf8');

    expect(builtEntry).toContain('PROJECT_SLUG: slug');
    expect(builtEntry).toContain('DB_PORT: String(db)');
    expect(builtEntry).toContain('DB_TEST_PORT: String(5434 + portOffset)');
  });
});
