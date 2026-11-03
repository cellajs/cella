import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ArchiveDigest, ReleaseManifest } from '../lib/deploy/release-archives';
import { type BuildEffects, type BuildReleaseOptions, buildRelease } from './build-release';

const sha = 'c'.repeat(40);
const digest: ArchiveDigest = { sha256: 'a'.repeat(64), md5: 'b'.repeat(32), bytes: 10 };
const manifest: ReleaseManifest = { release: sha, images: { backend: digest, 'infra-boot': digest }, frontend: digest };

/** `earlier`: the result an earlier build of the commit left under its prefix an hour before, served with its step and log for two polls. */
function fake(
  opts: {
    present?: boolean;
    result?: string;
    never?: boolean;
    step?: string;
    outOfStock?: string;
    earlier?: string;
    mismatch?: string;
    unparsable?: boolean;
  } = {},
) {
  const ops: string[] = [];
  let built = false;
  let published = false;
  let polls = 0;
  const fx: BuildEffects = {
    manifest: async () => {
      if (opts.unparsable && !built) throw new SyntaxError('Unexpected token b in JSON at position 33');
      return opts.present || built ? manifest : undefined;
    },
    archiveMatches: async (key) => !(opts.mismatch && key.includes(opts.mismatch) && !built),
    links: async (archives) => {
      ops.push('links');
      return Object.fromEntries(archives.map((name) => [`image:${name}`, `https://link/${name}`]));
    },
    repositoryKey: async () => undefined,
    entryFile: async (name) => (opts.present || published ? Buffer.from(`<${name}>`) : undefined),
    uploadFrontend: async () => {
      ops.push('upload-frontend');
      published = true;
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
      if (opts.earlier && polls <= 2) {
        const body = name === 'result' ? opts.earlier : name === 'step' ? 'files' : 'the earlier log';
        return { body, modified: new Date(Date.now() - 3_600_000) };
      }
      const modified = new Date();
      if (name === 'step') return { body: opts.step ?? 'images', modified };
      if (name === 'log') return { body: 'the end of the log', modified };
      built = opts.result !== 'failed';
      return { body: opts.result ?? 'ok', modified };
    },
    sleep: async () => {
      polls++;
    },
  };
  return { fx, ops };
}

const options = (overrides: Partial<BuildReleaseOptions> = {}): BuildReleaseOptions => ({
  sha,
  builderName: 'app-builder-cccccccccc',
  zones: ['nl-ams-1', 'nl-ams-2', 'nl-ams-3'],
  archives: ['backend', 'infra-boot'],
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
    expect((await buildRelease(opts, fx)).outcome).toBe('present');
    expect(ops).toEqual(['remove']);
    expect(readFileSync(join(opts.distDir ?? '', 'index.html'), 'utf8')).toBe('<index.html>');
  });

  it('must not trust an archive that is not the one its manifest names: the release is built again', async () => {
    const { fx, ops } = fake({ present: true, mismatch: 'images/backend.tar' });
    expect((await buildRelease(options(), fx)).outcome).toBe('built');
    expect(ops).toContain('start:app-builder-cccccccccc@nl-ams-1');
  });

  it('builds a release again whose manifest cannot be parsed, and does not end the deploy on it', async () => {
    const { fx, ops } = fake({ present: true, unparsable: true });
    expect((await buildRelease(options(), fx)).outcome).toBe('built');
    expect(ops).toContain('start:app-builder-cccccccccc@nl-ams-1');
  });

  it('builds a missing release on a builder it deletes afterwards, then uploads its frontend files from their archive', async () => {
    const { fx, ops } = fake();
    expect((await buildRelease(options(), fx)).manifest).toEqual(manifest);
    expect(ops).toEqual(['remove', 'links', 'start:app-builder-cccccccccc@nl-ams-1', 'remove', 'upload-frontend']);
  });

  it('builds in the next zone of the region when Scaleway has the type out of stock, the machine it made in the first deleted', async () => {
    const { fx, ops } = fake({ outOfStock: 'nl-ams-1' });
    const lines: string[] = [];
    await buildRelease(options({ log: (line) => lines.push(line) }), fx);
    expect(ops.slice(0, 6)).toEqual([
      'remove',
      'links',
      'start:app-builder-cccccccccc@nl-ams-1',
      'remove',
      'start:app-builder-cccccccccc@nl-ams-2',
      'remove',
    ]);
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

  it("reads only its own builder's reports: an earlier build of the commit left its result under the same prefix", async () => {
    // Staging, 2026-10-28: every retry of a failed build read that build's result 15 s in, while its own builder was still booting.
    expect((await buildRelease(options(), fake({ earlier: 'failed' }).fx)).outcome).toBe('built');
    await expect(buildRelease(options(), fake({ earlier: 'ok', result: 'failed' }).fx)).rejects.toThrow(/failed at 'images'/);
  });

  it('stops waiting at its time limit, and deletes the builder', async () => {
    const { fx, ops } = fake({ never: true });
    await expect(buildRelease(options({ timeoutMs: 0 }), fx)).rejects.toThrow(/did not finish/);
    expect(ops.at(-1)).toBe('remove');
  });
});
