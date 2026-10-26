import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const dir = mkdtempSync(join(tmpdir(), 'observer-key-'));
vi.mock('./paths', () => ({ infraDir: dir }));
const { observerKeyInModeFile, writeObserverKey } = await import('./env-files');

describe('writeObserverKey', () => {
  it("writes one key into the environment's file and every other file that holds one, and drops the retired names there", () => {
    writeFileSync(
      join(dir, '.env.production'),
      'SCW_PROJECT_ID=p\nSCW_OBSERVER_ACCESS_KEY=OLD\nSCW_OBSERVER_SECRET_KEY=o\nSCW_ADMIN_ACCESS_KEY=A\nSCW_ADMIN_SECRET_KEY=a\n',
    );
    writeFileSync(join(dir, '.env.staging'), 'SCW_PROJECT_ID=s\n');

    const written = writeObserverKey('staging', { accessKey: 'SCWNEW', secretKey: 'n' }, ['production', 'staging', 'preview']);

    expect(written).toEqual([join(dir, '.env.staging'), join(dir, '.env.production')]);
    expect(observerKeyInModeFile('staging')).toEqual({ accessKey: 'SCWNEW', secretKey: 'n' });
    expect(readFileSync(join(dir, '.env.production'), 'utf8')).toBe('SCW_PROJECT_ID=p\nSCW_OBSERVER_ACCESS_KEY=SCWNEW\nSCW_OBSERVER_SECRET_KEY=n\n');
    expect(observerKeyInModeFile('preview')).toBeUndefined();
  });
});
