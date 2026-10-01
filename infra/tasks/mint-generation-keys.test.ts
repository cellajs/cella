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
 * transactional ordering (every bundle staged before any key deletion). Every
 * entry names the application or bundle it acted on.
 */
let ops: string[];
let mintCount: number;
let failStagingFor: string | undefined;
let missingApps: Set<string>;
/** The single-access bundles as staged: id → the key pair they carry. */
let staged: Map<string, { accessKey: string; secretKey: string }>;

const appId = (name: string) => `id-${name}`;
const BOOT = 'cella-production-boot';
const VM = (service: string) => `cella-production-vm-${service}`;
/** Keys an app holds before the mint, oldest first; only its own id appears in them. */
const priorKeys = (id: string) => [`${id}-old-1`, `${id}-old-2`, `${id}-live`, `${id}-fresh-x`];

function installMocks(): void {
  ops = [];
  mintCount = 0;
  failStagingFor = undefined;
  missingApps = new Set();
  staged = new Map();

  vi.mocked(scwFetch).mockImplementation(async (_auth, method, url: string, body?: unknown) => {
    if (method === 'GET' && url.includes('/applications?name=')) {
      const name = decodeURIComponent(new URL(url).searchParams.get('name') ?? '');
      if (missingApps.has(name)) return { applications: [] } as never;
      return { applications: [{ id: appId(name), name }] } as never;
    }
    if (method === 'POST' && url.endsWith('/api-keys')) {
      const { application_id: id, default_project_id: project } = body as { application_id: string; default_project_id: string };
      if (project !== 'proj') throw new Error(`key minted outside the project: ${project}`);
      mintCount += 1;
      ops.push(`mint:${id}`);
      return { access_key: `${id}-fresh-${mintCount}`, secret_key: `sk-${mintCount}`, created_at: '2026-01-29' } as never;
    }
    if (method === 'GET' && url.includes('/api-keys?application_id=')) {
      const id = new URL(url).searchParams.get('application_id') ?? '';
      // Two stale keys, the live one and a fresh one: pruning keeps the newest KEYS_TO_KEEP of this app only.
      return { api_keys: priorKeys(id).map((key, index) => ({ access_key: key, secret_key: '', created_at: `2026-01-${10 + index}` })) } as never;
    }
    throw new Error(`unexpected scwFetch ${method} ${url}`);
  });

  vi.mocked(scwSend).mockImplementation(async (_auth, method, url: string) => {
    ops.push(`${method.toLowerCase()}:${url.split('/').pop()}`);
  });

  vi.mocked(createSecretManagerClient).mockReturnValue({
    listSecretsUnder: async (folder: string) => [{ id: `stale-bundle:${folder}`, name: 'handoff-stale', region: 'nl-ams' }],
    deleteSecret: async (id: string) => {
      ops.push(`delete-bundle:${id}`);
    },
    ensureSecret: async ({ name, path, ephemeralPolicy }: { name: string; path: string; ephemeralPolicy: unknown }) => {
      // A bundle is readable once: the second read fails, which the booting VM treats as interception.
      expect(ephemeralPolicy, name).toEqual({ expires_once_accessed: true, action: 'disable' });
      return { id: `bundle:${path}${name}` };
    },
    putSecretValue: async ({ secretId, value }: { secretId: string; value: string }) => {
      if (failStagingFor && secretId.includes(failStagingFor)) throw new Error(`staging failed for ${secretId}`);
      staged.set(secretId, JSON.parse(value));
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

const keyDeletes = () => ops.filter((op) => op.startsWith('delete:'));

beforeEach(installMocks);

describe('mintGenerationKeys', () => {
  it("stages each service's own fresh key in a single-access bundle under its handoff folder, before pruning any key", async () => {
    const outFile = join(outDir, 'ok.json');
    const result = await mintGenerationKeys(options(outFile));

    const lastStage = ops.map((op) => op.startsWith('stage:')).lastIndexOf(true);
    const firstKeyDelete = ops.findIndex((op) => op.startsWith('delete:'));
    expect(lastStage).toBeGreaterThanOrEqual(0);
    expect(firstKeyDelete).toBeGreaterThan(lastStage);

    // One mint per principal, on that principal.
    expect(ops.filter((op) => op.startsWith('mint:'))).toEqual([
      `mint:${appId(BOOT)}`,
      `mint:${appId(VM('backend'))}`,
      `mint:${appId(VM('frontend'))}`,
    ]);
    expect(result.bootAccessKey).toBe(`${appId(BOOT)}-fresh-1`);
    expect(result.handoffSecretIds).toEqual({
      backend: 'bundle:/cella-production/handoff/backend/handoff-backend-abcdef0123',
      frontend: 'bundle:/cella-production/handoff/frontend/handoff-frontend-abcdef0123',
    });
    for (const [service, count] of [
      ['backend', 2],
      ['frontend', 3],
    ] as const) {
      expect(staged.get(result.handoffSecretIds[service] ?? '')).toEqual({
        accessKey: `${appId(VM(service))}-fresh-${count}`,
        secretKey: `sk-${count}`,
      });
    }
    // Stale bundles of the service's own folder go first.
    expect(ops.filter((op) => op.startsWith('delete-bundle:'))).toEqual([
      'delete-bundle:stale-bundle:/cella-production/handoff/backend/',
      'delete-bundle:stale-bundle:/cella-production/handoff/frontend/',
    ]);
    expect(JSON.parse(readFileSync(outFile, 'utf8'))).toEqual(result);
  });

  it('prunes exactly the keys beyond the newest KEYS_TO_KEEP, per app', async () => {
    await mintGenerationKeys(options(join(outDir, 'prune.json')));
    // 3 apps (boot + 2 services), each losing its own two oldest keys; the newest 2 survive.
    expect(keyDeletes().sort()).toEqual(
      [BOOT, VM('backend'), VM('frontend')].flatMap((app) => [`delete:${appId(app)}-old-1`, `delete:${appId(app)}-old-2`]).sort(),
    );
  });

  it('purges every key on a dormant principal, after all bundles are staged', async () => {
    const result = await mintGenerationKeys({ ...options(join(outDir, 'dormant.json')), dormantServices: ['yjs'] });

    const lastStage = ops.map((op) => op.startsWith('stage:')).lastIndexOf(true);
    // 6 stale-prune deletes on the live apps plus all 4 keys on the dormant app.
    expect(keyDeletes()).toHaveLength(10);
    expect(keyDeletes().slice(-4)).toEqual(priorKeys(appId(VM('yjs'))).map((key) => `delete:${key}`));
    expect(ops.findIndex((op) => op.startsWith('delete:'))).toBeGreaterThan(lastStage);
    expect(Object.keys(result.handoffSecretIds)).toEqual(['backend', 'frontend']);
  });

  it('a missing dormant application only logs; the live principals still mint', async () => {
    missingApps.add(VM('mcp'));
    const logs: string[] = [];
    const result = await mintGenerationKeys({
      ...options(join(outDir, 'dormant-missing.json')),
      dormantServices: ['mcp'],
      log: (msg) => logs.push(msg),
    });

    expect(result.bootAccessKey).toBe(`${appId(BOOT)}-fresh-1`);
    expect(keyDeletes()).toHaveLength(6);
    expect(logs.some((line) => line.includes(`dormant application ${VM('mcp')} not found`))).toBe(true);
  });

  it('a staging failure aborts with ZERO api keys pruned (old generation keeps its keys)', async () => {
    failStagingFor = 'handoff-frontend';
    await expect(mintGenerationKeys(options(join(outDir, 'fail.json')))).rejects.toThrow(/staging failed/);
    expect(keyDeletes()).toEqual([]);
    // The first service's bundle was staged before the failure, and that is
    // fine; what must not happen is key pruning.
    expect(ops.filter((op) => op.startsWith('stage:'))).toHaveLength(1);
  });
});
