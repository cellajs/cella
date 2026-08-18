import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { writeFileMode } from './fs-utils';

describe('writeFileMode', () => {
  it('creates the file with the requested mode and content', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'fsu-'));
    const path = join(dir, 'nested', 'secret');
    await writeFileMode(path, 'value', 0o600);
    expect(await readFile(path, 'utf-8')).toBe('value');
    expect((await stat(path)).mode & 0o777).toBe(0o600);
  });

  it('tightens a pre-existing world-readable file (the create-then-chmod race fix)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'fsu-'));
    const path = join(dir, 'secret');
    await writeFile(path, 'old', { mode: 0o644 });
    await writeFileMode(path, 'new', 0o600);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
  });
});
