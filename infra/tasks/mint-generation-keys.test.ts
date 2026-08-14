import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSecretManagerClient } from '../lib/scaleway/scaleway-secret-manager';
import { scwFetch, scwSend } from '../lib/scaleway/scw-fetch';
import { mintGenerationKeys } from './mint-generation-keys';

vi.mock('../lib/scaleway/scw-fetch', () => ({ scwFetch: vi.fn(), scwSend: vi.fn() }));
vi.mock('../lib/scaleway/scaleway-secret-manager', () => ({ createSecretManagerClient: vi.fn() }));

/**
 * Ordered operation log across both mocked APIs, so the tests can assert the
 * transactional ordering (every bundle staged before any key deletion).
 */
let ops: string[];
let mintCount: number;
let failStagingFor: string | undefined;

function installMocks(): void {
  ops = [];
  mintCount = 0;
  failStagingFor = undefined;

  vi.mocked(scwFetch).mockImplementation(async (_auth, method, url: string) => {
    if (method === 'GET' && url.includes('/applications?name=')) {
      const name = decodeURIComponent(new URL(url).searchParams.get('name') ?? '');
      return { applications: [{ id: `id-${name}`, name }] } as never;
    }
    if (method === 'POST' && url.endsWith('/api-keys')) {
      mintCount += 1;
      ops.push(`mint:${mintCount}`);
      return { access_key: `ak-fresh-${mintCount}`, secret_key: 'sk', created_at: `2026-01-2${mintCount}` } as never;
    }
    if (method === 'GET' && url.includes('/api-keys?application_id=')) {
      // Two stale keys plus the freshly-minted ones: prune must delete exactly
      // the two oldest and keep the newest KEYS_TO_KEEP.
      return {
        api_keys: [
          { access_key: 'ak-old-1', secret_key: '', created_at: '2026-01-01' },
          { access_key: 'ak-old-2', secret_key: '', created_at: '2026-01-02' },
          { access_key: 'ak-live', secret_key: '', created_at: '2026-01-10' },
          { access_key: 'ak-fresh-x', secret_key: '', created_at: '2026-01-29' },
        ],
      } as never;
    }
    throw new Error(`unexpected scwFetch ${method} ${url}`);
  });

  vi.mocked(scwSend).mockImplementation(async (_auth, method, url: string) => {
    ops.push(`${method.toLowerCase()}:${url.split('/').pop()}`);
  });

  vi.mocked(createSecretManagerClient).mockReturnValue({
    listSecretsUnder: async () => [{ id: 'stale-bundle', name: 'handoff-stale', region: 'nl-ams' }],
    deleteSecret: async (id: string) => {
      ops.push(`delete-bundle:${id}`);
    },
    ensureSecret: async ({ name }: { name: string }) => ({ id: `bundle-${name}` }),
    putSecretValue: async ({ secretId }: { secretId: string }) => {
      if (failStagingFor && secretId.includes(failStagingFor)) throw new Error(`staging failed for ${secretId}`);
      ops.push(`stage:${secretId}`);
    },
  } as never);
}

const outDir = mkdtempSync(join(tmpdir(), 'mint-test-'));

function options(outFile: string) {
  return {
    slug: 'cella',
    mode: 'production',
    sha: 'abcdef012345',
    region: 'nl-ams',
    projectId: 'proj',
    organizationId: 'org',
    services: ['backend', 'frontend'] as const,
    callerSecretKey: 'ci-secret',
    outFile,
    log: () => {},
  };
}

beforeEach(installMocks);

describe('mintGenerationKeys', () => {
  it('stages every handoff bundle before pruning any api key', async () => {
    const outFile = join(outDir, 'ok.json');
    const result = await mintGenerationKeys(options(outFile));

    const lastStage = ops.map((op) => op.startsWith('stage:')).lastIndexOf(true);
    const firstKeyDelete = ops.findIndex((op) => op.startsWith('delete:ak-'));
    expect(lastStage).toBeGreaterThanOrEqual(0);
    expect(firstKeyDelete).toBeGreaterThan(lastStage);

    expect(result.bootAccessKey).toBe('ak-fresh-1');
    expect(Object.keys(result.handoffSecretIds)).toEqual(['backend', 'frontend']);
    expect(JSON.parse(readFileSync(outFile, 'utf8'))).toEqual(result);
  });

  it('prunes exactly the keys beyond the newest KEYS_TO_KEEP, per app', async () => {
    await mintGenerationKeys(options(join(outDir, 'prune.json')));
    const keyDeletes = ops.filter((op) => op.startsWith('delete:ak-'));
    // 3 apps (boot + 2 services) × 2 stale keys each; the newest 2 survive.
    expect(keyDeletes).toHaveLength(6);
    expect(new Set(keyDeletes)).toEqual(new Set(['delete:ak-old-1', 'delete:ak-old-2']));
  });

  it('a staging failure aborts with ZERO api keys pruned (old generation keeps its credentials)', async () => {
    failStagingFor = 'handoff-frontend';
    await expect(mintGenerationKeys(options(join(outDir, 'fail.json')))).rejects.toThrow(/staging failed/);
    expect(ops.some((op) => op.startsWith('delete:ak-'))).toBe(false);
    // The first service's bundle was staged before the failure, and that is
    // fine; what must not happen is key pruning.
    expect(ops.filter((op) => op.startsWith('stage:'))).toHaveLength(1);
  });
});
