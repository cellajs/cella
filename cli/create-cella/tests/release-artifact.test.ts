import { execFileSync } from 'node:child_process';
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
});
