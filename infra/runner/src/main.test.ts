import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('the runner program', () => {
  it('runs on Node alone, with nothing installed: every module it loads names its imports with their extension', () => {
    const result = spawnSync(process.execPath, [join(import.meta.dirname, 'main.ts'), '--help'], { encoding: 'utf8' });
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/^Usage: node runner\/src\/main\.ts/);
  });
});
