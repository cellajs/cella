import 'fake-indexeddb/auto';
import { dehydrate, QueryClient } from '@tanstack/react-query';
import type { PersistedClient } from '@tanstack/react-query-persist-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Node test env: persister.ts touches sessionStorage + window at module load.
const sessionValues = new Map<string, string>();
vi.stubGlobal('sessionStorage', {
  getItem: (k: string) => sessionValues.get(k) ?? null,
  setItem: (k: string, v: string) => sessionValues.set(k, v),
  removeItem: (k: string) => sessionValues.delete(k),
});
vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
// No locks API: liveness detection falls back to the record-age threshold. The user agent is read at import by the UI
// primitives behind the page module imported below.
vi.stubGlobal('navigator', { onLine: true, userAgent: '' });

const { bindLocalUserDb, getLocalUserDb } = await import('~/query/local-user-db');
const { createIDBPersister, shouldPersistQuery } = await import('~/query/persister');
const { yjsTokenQueryOptions } = await import('~/modules/common/blocknote/query');
const { pendingMagicLinkQueryOptions } = await import('~/modules/auth/confirm-sign-in-page');

bindLocalUserDb('persister-test-user');

// The filter every persisted snapshot passes through, fed the app's own query options, so a query that must stay out
// of the local database is checked as declared and not as restated here.
describe('persister query filter', () => {
  it('must not persist the Yjs token or the pending magic link, while an ordinary query persists', async () => {
    const queryClient = new QueryClient();
    const yjsToken = yjsTokenQueryOptions({ entityType: 'attachment', entityId: 'attachment-1', tenantId: 'tenant-1', organizationId: 'org-1' });
    await queryClient.query({ ...yjsToken, queryFn: async () => 'a-bearer-token' });
    await queryClient.query({ ...pendingMagicLinkQueryOptions, queryFn: async () => ({ email: 'other@example.com' }) });
    await queryClient.query({ queryKey: ['organization', 'list'], queryFn: async () => [] });

    const { queries } = dehydrate(queryClient, { shouldDehydrateQuery: shouldPersistQuery });

    expect(queries.map((query) => query.queryKey)).toEqual([['organization', 'list']]);
  });
});

const pausedMutation = (key: string) =>
  ({
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
  }) as unknown as NonNullable<PersistedClient['clientState']['mutations']>[number];

const clientWith = (mutations: PersistedClient['clientState']['mutations']): PersistedClient => ({
  timestamp: Date.now(),
  buster: '',
  clientState: { queries: [], mutations },
});

describe('persister per-tab mutation records (D5)', () => {
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
    // A tab that is still open writes its own queue after this one...
    sessionValues.set(tabIdKey, 'other-live-tab');
    const otherTab = createIDBPersister('rq');
    await otherTab.persistClient(clientWith([pausedMutation('other')]));
    await otherTab.flush();
    sessionValues.set(tabIdKey, thisTab);
    // ...and a tab that crashed hours ago left one behind (without the locks API, age tells a dead tab).
    await db?.meta.put({
      key: 'rq:mut:dead-tab',
      timestamp: Date.now() - 3 * 60 * 60 * 1000,
      buster: '',
      mutations: [pausedMutation('crashed')],
      channelQueries: [],
    });

    const restored = await persister.restoreClient();

    expect(restored?.clientState.mutations.map(({ state }) => (state.variables as { id: string }).id).sort()).toEqual(['crashed', 'own']);
    // The open tab keeps its record, the dead one's is taken over, and this tab's own stays until its next write.
    const keys = ((await db?.meta.toArray()) ?? []).map((record) => record.key);
    expect(keys.sort()).toEqual(['rq', 'rq:mut:other-live-tab', `rq:mut:${thisTab}`].sort());
  });
});
