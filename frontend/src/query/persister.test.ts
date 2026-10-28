import 'fake-indexeddb/auto';
import '~/query/tests/query-client-env';
import { dehydrate, QueryClient } from '@tanstack/react-query';
import type { PersistedClient } from '@tanstack/react-query-persist-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Node test env: persister.ts touches sessionStorage at module load. The env's navigator has no locks API, so liveness
// detection falls back to the record-age threshold.
const sessionValues = new Map<string, string>();
vi.stubGlobal('sessionStorage', {
  getItem: (key: string) => sessionValues.get(key) ?? null,
  setItem: (key: string, value: string) => sessionValues.set(key, value),
  removeItem: (key: string) => sessionValues.delete(key),
});

const { bindLocalUserDb, getLocalUserDb } = await import('~/query/local-user-db');
const { createIDBPersister, shouldPersistQuery } = await import('~/query/persister');
const { yjsTokenQueryOptions } = await import('~/modules/common/blocknote/query');
const { pendingMagicLinkQueryOptions, tokenDataQueryOptions } = await import('~/modules/auth/query');
const { totpKeyQueryOptions } = await import('~/modules/me/query');

bindLocalUserDb('persister-test-user');

// The filter every persisted snapshot passes through, fed the app's own query options, so a query that must stay out
// of the local database is checked as declared and not as restated here.
describe('persister query filter', () => {
  it('must not persist the Yjs token, the pending magic link, token data or a TOTP key, while an ordinary query persists', async () => {
    const queryClient = new QueryClient();
    const yjsToken = yjsTokenQueryOptions({ entityType: 'attachment', entityId: 'attachment-1', tenantId: 'tenant-1', organizationId: 'org-1' });
    await queryClient.query({ ...yjsToken, queryFn: async () => 'a-bearer-token' });
    await queryClient.query({ ...pendingMagicLinkQueryOptions, queryFn: async () => ({ email: 'other@example.com' }) });
    await queryClient.query({ ...tokenDataQueryOptions('invitation', 'token-1'), queryFn: async () => ({ email: 'invited@example.com' }) });
    await queryClient.query({ ...totpKeyQueryOptions(), queryFn: async () => ({ totpUri: 'otpauth://totp/x', manualKey: 'SECRET' }) });
    await queryClient.query({ queryKey: ['organization', 'list'], queryFn: async () => [] });

    const { queries } = dehydrate(queryClient, { shouldDehydrateQuery: shouldPersistQuery });

    expect(queries.map((query) => query.queryKey)).toEqual([['organization', 'list']]);
  });
});

const pausedMutation = (key: string): PersistedClient['clientState']['mutations'][number] => ({
  mutationKey: ['attachment', 'update'],
  state: {
    context: undefined,
    data: undefined,
    error: null,
    failureCount: 0,
    failureReason: null,
    isPaused: true,
    status: 'pending',
    variables: { id: key, ops: { name: key } },
    submittedAt: Date.now(),
  },
});

const clientWith = (mutations: PersistedClient['clientState']['mutations']): PersistedClient => ({
  timestamp: Date.now(),
  buster: '',
  clientState: { queries: [], mutations },
});

describe('persister per-tab mutation records', () => {
  const persister = createIDBPersister('rq');

  beforeEach(async () => {
    const db = getLocalUserDb();
    await db?.queries.clear();
    await db?.meta.clear();
  });

  afterEach(async () => {
    const db = getLocalUserDb();
    await db?.queries.clear();
    await db?.meta.clear();
  });

  // A queue in the shared meta record let one tab's write overwrite another tab's queue: each tab writes its own record.
  it('restores every queued mutation once: no tab overwrites the queue of another, or takes over one still open', async () => {
    const db = getLocalUserDb();
    const tabIdKey = [...sessionValues.keys()].find((key) => key.endsWith('-tab-session-id')) as string;
    const thisTab = sessionValues.get(tabIdKey) as string;

    await persister.persistClient(clientWith([pausedMutation('own')]));
    await persister.flush();
    // A tab that is still open has written its own queue (each tab reads its id once, so its record is written here)...
    await db?.meta.put({ key: 'rq:mut:other-live-tab', timestamp: Date.now(), buster: '', mutations: [pausedMutation('other')], bundledQueries: [] });
    // ...and a tab that crashed hours ago left one behind (without the locks API, age tells a dead tab).
    await db?.meta.put({
      key: 'rq:mut:dead-tab',
      timestamp: Date.now() - 3 * 60 * 60 * 1000,
      buster: '',
      mutations: [pausedMutation('crashed')],
      bundledQueries: [],
    });

    const restored = await persister.restoreClient();

    expect(restored?.clientState.mutations.map(({ state }) => (state.variables as { id: string }).id).sort()).toEqual(['crashed', 'own']);
    // The open tab keeps its record, the dead one's is taken over, and this tab's own stays until its next write.
    const keys = ((await db?.meta.toArray()) ?? []).map((record) => record.key);
    expect(keys.sort()).toEqual(['rq', 'rq:mut:other-live-tab', `rq:mut:${thisTab}`].sort());
  });

  // The restore deleted a dead tab's record and stored its queue only at this tab's first write, up to a second later.
  it("keeps a dead tab's queue when this tab reloads before its first write", async () => {
    const db = getLocalUserDb();
    await db?.meta.put({ key: 'rq', timestamp: Date.now(), buster: '', mutations: [], bundledQueries: [] });
    await db?.meta.put({
      key: 'rq:mut:dead-tab',
      timestamp: Date.now() - 3 * 60 * 60 * 1000,
      buster: '',
      mutations: [pausedMutation('crashed')],
      bundledQueries: [],
    });

    await persister.restoreClient();
    const restored = await persister.restoreClient();

    expect(restored?.clientState.mutations.map(({ state }) => (state.variables as { id: string }).id)).toEqual(['crashed']);
  });
});
