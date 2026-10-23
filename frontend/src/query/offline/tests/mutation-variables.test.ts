import { type DehydratedState, dehydrate, hydrate, MutationObserver, onlineManager, QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type StoredMutation = DehydratedState['mutations'][number];

const { quarantineFailedSync } = vi.hoisted(() => ({ quarantineFailedSync: vi.fn(async (_record: Record<string, unknown>) => undefined) }));
vi.mock('~/query/offline/failed-sync', () => ({ quarantineFailedSync }));

const { createRowsOf, entityIdsOf, queuedUpdateOf, registerVariablesVersion, upgradePersistedMutation, variablesVersionOf, withVariablesVersion } =
  await import('../mutation-variables');

describe('reading queued variables', () => {
  it('reads the rows of a create as the live objects of its variables', () => {
    const variables = { tenantId: 't', organizationId: 'o', data: [{ id: 'a' }, { id: 'b' }] };
    expect(createRowsOf(variables)).toEqual([{ id: 'a' }, { id: 'b' }]);
    expect(createRowsOf(variables)[0]).toBe(variables.data[0]);
  });

  it('reads a create that carries one row, under `data` or at the top level, as a list of one', () => {
    const row = { id: 'a', name: 'One' };
    expect(createRowsOf({ tenantId: 't', data: row })).toEqual([row]);
    expect(createRowsOf(row)).toEqual([row]);
    // A top-level id marks the variables as the row: `data` is then one of its columns.
    const withDataColumn = { id: 'a', data: { id: 'not-a-row' } };
    expect(createRowsOf(withDataColumn)).toEqual([withDataColumn]);
  });

  it('reads no row from variables that are no create', () => {
    for (const variables of [undefined, null, 'text', [{ id: 'a' }], { tenantId: 't' }, { data: 'x' }, { data: [null, 3] }]) {
      expect(createRowsOf(variables), JSON.stringify(variables)).toEqual([]);
    }
  });

  it('reads an update of one row with its ops and stamps, and nothing from other variables', () => {
    const stx = { mutationId: 'm', sourceId: 's', fieldTimestamps: { name: '1:0:a' } };
    expect(queuedUpdateOf({ id: 'a', ops: { name: 'N' }, stx })).toEqual({ id: 'a', ops: { name: 'N' }, fieldTimestamps: { name: '1:0:a' } });
    expect(queuedUpdateOf({ id: 'a' })).toEqual({ id: 'a', ops: {}, fieldTimestamps: {} });
    expect(queuedUpdateOf({ data: [{ id: 'a' }] })).toBeNull();
    expect(queuedUpdateOf(undefined)).toBeNull();
  });

  it('reads the ids a create, an update and a delete touch', () => {
    expect(entityIdsOf({ tenantId: 't', data: [{ id: 'a' }, { id: 'b' }] })).toEqual(['a', 'b']);
    expect(entityIdsOf({ tenantId: 't', id: 'a', ops: {} })).toEqual(['a']);
    expect(entityIdsOf({ tenantId: 't', rows: [{ id: 'a' }, { id: 'b' }] })).toEqual(['a', 'b']);
    expect(entityIdsOf({ tenantId: 't', attachments: [{ id: 'a' }] })).toEqual([]);
    expect(entityIdsOf(undefined)).toEqual([]);
  });
});

describe('a queue restored by a newer bundle', () => {
  const deleteKey = ['thing', 'delete'] as const;
  const sent: unknown[] = [];

  /** A client of the bundle that reads `rows`: version 2 of the delete's variables. */
  const currentClient = () => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false, networkMode: 'offlineFirst' } } });
    client.setMutationDefaults(deleteKey, {
      mutationFn: async (variables: { rows: { id: string }[] }) => {
        sent.push(variables.rows.map((row) => row.id));
        return null;
      },
    });
    return client;
  };

  /** Queues a mutation offline and returns it as a store holds it: dehydrated and cloned, with the stamp of `version` if given. */
  const storedMutationOf = async (mutationKey: readonly unknown[], variables: unknown, version?: number): Promise<StoredMutation> => {
    const issuer = new QueryClient({ defaultOptions: { mutations: { retry: 1, retryDelay: 0, networkMode: 'offlineFirst' } } });
    const observer = new MutationObserver(issuer, {
      mutationKey,
      mutationFn: async (_variables: unknown) => {
        throw new TypeError('Failed to fetch');
      },
    });
    observer.mutate(variables).catch(() => {});
    await vi.waitFor(() => expect(issuer.getMutationCache().getAll()[0]?.state.isPaused).toBe(true));
    // A store keeps a structured clone: no function and no live object survives it.
    const [mutation] = structuredClone(dehydrate(issuer, { shouldDehydrateMutation: ({ state }) => state.isPaused })).mutations;
    return version === undefined ? mutation : { ...mutation, meta: { ...mutation.meta, variablesVersion: version } };
  };

  /** What the persister writes for the paused mutations of a client. */
  const persistedBy = (client: QueryClient): StoredMutation[] =>
    structuredClone(dehydrate(client, { shouldDehydrateMutation: ({ state }) => state.isPaused })).mutations.map(withVariablesVersion);

  beforeEach(() => {
    onlineManager.setOnline(false);
    sent.length = 0;
    quarantineFailedSync.mockClear();
    registerVariablesVersion(deleteKey, 2, (variables) => {
      if (typeof variables !== 'object' || variables === null || !('things' in variables)) return null;
      const { things, ...rest } = variables;
      return { ...rest, rows: things };
    });
  });

  afterEach(() => onlineManager.setOnline(true));

  it('stamps a mutation this bundle issued with the version of its key, 1 for a key that declares none', async () => {
    expect(variablesVersionOf(deleteKey)).toBe(2);
    expect(variablesVersionOf(['thing', 'update'])).toBe(1);
    expect(withVariablesVersion(await storedMutationOf(deleteKey, { rows: [] })).meta).toEqual({ variablesVersion: 2 });
    expect(withVariablesVersion(await storedMutationOf(['thing', 'update'], { id: 'a' })).meta).toEqual({ variablesVersion: 1 });
  });

  it('keeps the stamp a mutation already carries: its variables are in that shape, whatever is registered since', async () => {
    const restored = await storedMutationOf(deleteKey, { things: [] }, 1);
    expect(withVariablesVersion(restored).meta).toEqual({ variablesVersion: 1 });
  });

  it('rewrites a delete an older bundle queued into the shape this one reads, and replays it', async () => {
    // The older bundle knew no versions: its record carries no stamp.
    const stored = await storedMutationOf(deleteKey, { tenantId: 't', things: [{ id: 'a' }, { id: 'b' }] });

    const upgraded = upgradePersistedMutation(stored);
    expect(upgraded?.state.variables).toEqual({ tenantId: 't', rows: [{ id: 'a' }, { id: 'b' }] });
    expect(upgraded?.meta).toEqual({ variablesVersion: 2 });

    const client = currentClient();
    hydrate(client, { queries: [], mutations: upgraded ? [upgraded] : [] });
    onlineManager.setOnline(true);
    await client.resumePausedMutations();

    expect(sent).toEqual([['a', 'b']]);
    expect(quarantineFailedSync).not.toHaveBeenCalled();
  });

  it('leaves a mutation stored at the current version as it is, also through a second reload', async () => {
    const [stored] = [withVariablesVersion(await storedMutationOf(deleteKey, { tenantId: 't', rows: [{ id: 'a' }] }))];
    expect(stored.meta).toEqual({ variablesVersion: 2 });

    const first = upgradePersistedMutation(stored);
    expect(first?.state.variables).toEqual({ tenantId: 't', rows: [{ id: 'a' }] });

    // Hydrated, persisted again and restored.
    const client = currentClient();
    hydrate(client, { queries: [], mutations: first ? [first] : [] });
    const [again] = persistedBy(client);
    expect(again.meta).toEqual({ variablesVersion: 2 });
    expect(upgradePersistedMutation(again)?.state.variables).toEqual({ tenantId: 't', rows: [{ id: 'a' }] });
    expect(quarantineFailedSync).not.toHaveBeenCalled();
  });

  it('moves a mutation it cannot upgrade to the quarantine, with its variables, and hands back nothing to replay', async () => {
    const stx = { mutationId: 'mut-1', sourceId: 'tab', fieldTimestamps: {} };
    const stored = await storedMutationOf(deleteKey, { tenantId: 't', unknownShape: true, stx });

    expect(upgradePersistedMutation(stored)).toBeNull();
    expect(quarantineFailedSync).toHaveBeenCalledTimes(1);
    expect(quarantineFailedSync.mock.lastCall?.[0]).toMatchObject({
      mutationId: 'mut-1',
      mutationKey: deleteKey,
      status: 0,
      variables: { tenantId: 't', unknownShape: true, stx },
      error: { reason: 'variables_version', storedVersion: 1, currentVersion: 2 },
    });
  });

  it('gives a quarantined mutation without an stx an id of its own', async () => {
    const stored = await storedMutationOf(deleteKey, { tenantId: 't', unknownShape: true });

    expect(upgradePersistedMutation(stored)).toBeNull();
    expect(String(quarantineFailedSync.mock.lastCall?.[0].mutationId)).toMatch(/^queued:\["thing","delete"\]:\d+$/);
  });

  it('quarantines the one mutation whose upgrade throws, and goes on with the rest of the queue', async () => {
    const brokenKey = ['broken', 'delete'] as const;
    registerVariablesVersion(brokenKey, 2, (variables) => ({ rows: (variables as { things: unknown[] }).things.slice() }));
    const broken = await storedMutationOf(brokenKey, { tenantId: 't', stx: { mutationId: 'mut-broken' } });
    const healthy = await storedMutationOf(deleteKey, { tenantId: 't', things: [{ id: 'a' }] });

    const restored = [broken, healthy].flatMap((mutation) => upgradePersistedMutation(mutation) ?? []);

    expect(restored.map(({ state }) => state.variables)).toEqual([{ tenantId: 't', rows: [{ id: 'a' }] }]);
    expect(quarantineFailedSync).toHaveBeenCalledTimes(1);
    expect(quarantineFailedSync.mock.lastCall?.[0]).toMatchObject({ mutationId: 'mut-broken', error: { storedVersion: 1, currentVersion: 2 } });
  });

  it('quarantines a mutation a newer bundle stored: after a rollback nothing here reads that shape', async () => {
    const ahead = await storedMutationOf(deleteKey, { tenantId: 't', newerShape: [{ id: 'a' }] }, 3);

    expect(upgradePersistedMutation(ahead)).toBeNull();
    expect(quarantineFailedSync.mock.lastCall?.[0]).toMatchObject({ error: { reason: 'variables_version', storedVersion: 3, currentVersion: 2 } });
  });

  it('leaves a mutation whose key declares no version as it is, with the stamp it had', async () => {
    const unversioned = await storedMutationOf(['thing', 'update'], { id: 'a', ops: { name: 'N' } });
    const restored = upgradePersistedMutation(unversioned);
    expect(restored?.state.variables).toEqual({ id: 'a', ops: { name: 'N' } });
    expect(restored?.meta).toEqual({ variablesVersion: 1 });

    // A key whose module is not loaded yet looks the same: the stamp its own bundle wrote is kept, never lowered.
    const ofLateModule = await storedMutationOf(['later', 'delete'], { rows: [{ id: 'a' }] }, 2);
    expect(upgradePersistedMutation(ofLateModule)?.meta).toEqual({ variablesVersion: 2 });
    expect(quarantineFailedSync).not.toHaveBeenCalled();
  });

  it('upgrades at the next restore a mutation whose version was registered after this one', async () => {
    // The module that owns this key loads after the queue is restored: no version is known yet.
    const lateKey = ['late', 'delete'] as const;
    const stored = await storedMutationOf(lateKey, { tenantId: 't', things: [{ id: 'a' }] });
    const first = upgradePersistedMutation(stored);
    expect(first?.state.variables).toEqual({ tenantId: 't', things: [{ id: 'a' }] });

    const client = new QueryClient({ defaultOptions: { mutations: { retry: false, networkMode: 'offlineFirst' } } });
    hydrate(client, { queries: [], mutations: first ? [first] : [] });
    registerVariablesVersion(lateKey, 2, (variables) => {
      const { things, ...rest } = variables as { things: unknown[] };
      return { ...rest, rows: things };
    });

    // The next write must not call the old shape current.
    const [written] = persistedBy(client);
    expect(written.meta).toEqual({ variablesVersion: 1 });
    expect(upgradePersistedMutation(written)?.state.variables).toEqual({ tenantId: 't', rows: [{ id: 'a' }] });
  });
});
