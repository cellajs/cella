import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { type BuildEffects, type BuildReleaseOptions, buildRelease } from './build-release';

const epoch = '0123456789ab';

function fake(opts: { present?: boolean; result?: string; never?: boolean; step?: string; epochOnFiles?: string; outOfStock?: string } = {}) {
  const ops: string[] = [];
  let built = false;
  const fx: BuildEffects = {
    imagePresent: async () => opts.present === true || built,
    entryFile: async (name) => {
      if (!opts.present && !built) return undefined;
      return Buffer.from(name === 'epoch' ? (built ? epoch : (opts.epochOnFiles ?? epoch)) : `<${name}>`);
    },
    keys: async () => {
      ops.push('keys');
      return { bundleId: 'bundle-1', boot: { accessKey: 'SCWBOOT', secretKey: 'boot-secret' } };
    },
    removeBuilders: async () => {
      ops.push('remove');
      return [];
    },
    startBuilder: async (zone, name) => {
      ops.push(`start:${name}@${zone}`);
      if (zone === opts.outOfStock) {
        throw new Error(
          `Scaleway POST https://api.scaleway.com/instance/v1/zones/${zone}/servers/0b1d/action → 412: {"type": "out_of_stock", "message": "resource is out of stock", "resource": "POP2-HC-8C-16G"}`,
        );
      }
    },
    report: async (name) => {
      if (opts.never) return undefined;
      if (name === 'step') return opts.step ?? 'images';
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
  epoch,
  builderName: 'app-builder-cccccccccc',
  zones: ['nl-ams-1', 'nl-ams-2', 'nl-ams-3'],
  images: ['backend', 'infra-boot'],
  withFrontend: true,
  distDir: mkdtempSync(join(tmpdir(), 'release-')),
  cloudConfig: () => '#cloud-config',
  log: () => {},
  ...overrides,
});

describe('buildRelease', () => {
  it('makes no builder for a release that is built, deletes one a cancelled deploy left, and writes its entry files', async () => {
    const { fx, ops } = fake({ present: true });
    const opts = options();
    expect(await buildRelease(opts, fx)).toBe('present');
    expect(ops).toEqual(['remove']);
    expect(readFileSync(join(opts.distDir ?? '', 'index.html'), 'utf8')).toBe('<index.html>');
  });

  it('must not trust frontend files pushed before the last rotation: their epoch differs, so the release is built again', async () => {
    const { fx, ops } = fake({ present: true, epochOnFiles: 'before-rotation' });
    expect(await buildRelease(options(), fx)).toBe('built');
    expect(ops).toContain('start:app-builder-cccccccccc@nl-ams-1');
  });

  it('builds a missing release on a builder it deletes afterwards, a leftover one deleted first', async () => {
    const { fx, ops } = fake();
    expect(await buildRelease(options(), fx)).toBe('built');
    expect(ops).toEqual(['remove', 'keys', 'start:app-builder-cccccccccc@nl-ams-1', 'remove']);
  });

  it('builds in the next zone of the region when Scaleway has the type out of stock, the machine it made in the first deleted', async () => {
    const { fx, ops } = fake({ outOfStock: 'nl-ams-1' });
    const lines: string[] = [];
    expect(await buildRelease(options({ log: (line) => lines.push(line) }), fx)).toBe('built');
    expect(ops).toEqual(['remove', 'keys', 'start:app-builder-cccccccccc@nl-ams-1', 'remove', 'start:app-builder-cccccccccc@nl-ams-2', 'remove']);
    expect(lines).toContain('  ~ nl-ams-1 has no POP2-HC-8C-16G in stock: trying nl-ams-2');
  });

  it('fails with the end of the log when the build fails, and deletes the builder all the same', async () => {
    const { fx, ops } = fake({ result: 'failed' });
    await expect(buildRelease(options(), fx)).rejects.toThrow(/failed at 'images'[\s\S]*the end of the log/);
    expect(ops.at(-1)).toBe('remove');
  });

  it('names the repository read key when the builder could not fetch the commit: a private repository answers as if it were not there', async () => {
    const { fx } = fake({ result: 'failed', step: 'clone' });
    await expect(buildRelease(options(), fx)).rejects.toThrow(/failed at 'clone'[\s\S]*pnpm infra repository-key/);
    await expect(buildRelease(options(), fake({ result: 'failed' }).fx)).rejects.not.toThrow(/repository-key/);
  });

  it('stops waiting at its time limit, and deletes the builder', async () => {
    const { fx, ops } = fake({ never: true });
    await expect(buildRelease(options({ timeoutMs: 0 }), fx)).rejects.toThrow(/did not finish/);
    expect(ops.at(-1)).toBe('remove');
  });
});
