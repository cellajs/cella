import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { type BuildEffects, type BuildReleaseOptions, buildRelease } from './build-release';

function fake(opts: { present?: boolean; result?: string; never?: boolean } = {}) {
  const ops: string[] = [];
  let built = false;
  const fx: BuildEffects = {
    imagePresent: async () => opts.present === true || built,
    entryFile: async (name) => (opts.present || built ? Buffer.from(`<${name}>`) : undefined),
    keys: async () => {
      ops.push('keys');
      return { bundleId: 'bundle-1', boot: { accessKey: 'SCWBOOT', secretKey: 'boot-secret' } };
    },
    removeBuilders: async () => {
      ops.push('remove');
      return [];
    },
    startBuilder: async (name) => {
      ops.push(`start:${name}`);
    },
    report: async (name) => {
      if (opts.never) return undefined;
      if (name === 'step') return 'images';
      if (name === 'log') return 'the end of the log';
      built = opts.result !== 'failed';
      return opts.result ?? 'ok';
    },
    sleep: async () => {},
  };
  return { fx, ops };
}

const options = (overrides: Partial<BuildReleaseOptions> = {}): BuildReleaseOptions => ({
  sha: 'c'.repeat(40),
  builderName: 'app-builder-cccccccccc',
  images: ['backend', 'infra-boot'],
  withFrontend: true,
  distDir: mkdtempSync(join(tmpdir(), 'release-')),
  cloudConfig: () => '#cloud-config',
  log: () => {},
  ...overrides,
});

describe('buildRelease', () => {
  it('makes no builder for a release that is built, and writes its entry files', async () => {
    const { fx, ops } = fake({ present: true });
    const opts = options();
    expect(await buildRelease(opts, fx)).toBe('present');
    expect(ops).toEqual([]);
    expect(readFileSync(join(opts.distDir ?? '', 'index.html'), 'utf8')).toBe('<index.html>');
  });

  it('builds a missing release on a builder it deletes afterwards, a leftover one deleted first', async () => {
    const { fx, ops } = fake();
    expect(await buildRelease(options(), fx)).toBe('built');
    expect(ops).toEqual(['remove', 'keys', 'start:app-builder-cccccccccc', 'remove']);
  });

  it('fails with the end of the log when the build fails, and deletes the builder all the same', async () => {
    const { fx, ops } = fake({ result: 'failed' });
    await expect(buildRelease(options(), fx)).rejects.toThrow(/failed at 'images'[\s\S]*the end of the log/);
    expect(ops.at(-1)).toBe('remove');
  });

  it('stops waiting at its time limit, and deletes the builder', async () => {
    const { fx, ops } = fake({ never: true });
    await expect(buildRelease(options({ timeoutMs: 0 }), fx)).rejects.toThrow(/did not finish/);
    expect(ops.at(-1)).toBe('remove');
  });
});
