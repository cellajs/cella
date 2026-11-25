import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const dir = mkdtempSync(join(tmpdir(), 'observer-key-'));
vi.mock('./paths', () => ({ infraDir: dir, machineDir: (appSlug: string) => join(dir, 'home', appSlug) }));
const { loadObserverKey, observerKeyFile, storedObserverKey } = await import('./env-files');

afterEach(() => vi.unstubAllEnvs());

describe('loadObserverKey', () => {
  it("moves a checkout's observer key to the machine's file, loads it, and names a second key to delete", () => {
    vi.stubEnv('SCW_OBSERVER_ACCESS_KEY', 'SCWAMBIENT');
    vi.stubEnv('SCW_OBSERVER_SECRET_KEY', 'ambient');
    writeFileSync(
      join(dir, '.env.production'),
      'SCW_DEFAULT_PROJECT_ID=p\nSCW_OBSERVER_ACCESS_KEY=SCWONE\nSCW_OBSERVER_SECRET_KEY=one\nSCW_ADMIN_ACCESS_KEY=A\nSCW_ADMIN_SECRET_KEY=a\n',
    );
    writeFileSync(join(dir, '.env.staging'), 'SCW_OBSERVER_ACCESS_KEY=SCWTWO\nSCW_OBSERVER_SECRET_KEY=two\n');

    const warnings = loadObserverKey('acme', ['production', 'staging', 'preview']);

    expect(storedObserverKey('acme')).toEqual({ accessKey: 'SCWONE', secretKey: 'one' });
    expect(statSync(observerKeyFile('acme')).mode & 0o777).toBe(0o600);
    expect(readFileSync(join(dir, '.env.production'), 'utf8')).toBe('SCW_DEFAULT_PROJECT_ID=p\n');
    expect(existsSync(join(dir, '.env.staging'))).toBe(false);
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain(observerKeyFile('acme'));
    expect(warnings[1]).toContain('SCWTWO');
    expect(process.env.SCW_OBSERVER_SECRET_KEY).toBe('one');
  });
});
