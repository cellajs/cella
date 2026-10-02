import 'fake-indexeddb/auto';
import { Dexie } from 'dexie';
import { expect, it, vi } from 'vitest';

vi.mock('shared', () => ({ appConfig: { slug: 'test' } }));

const { bindLocalUserDb, deletedElsewhereListeners, getLocalUserDb, LocalUserDatabase } = await import('~/query/local-user-db');

it('a delete from another tab closes for good, unbinds, notifies, and does not get recreated by a late write', async () => {
  const db = bindLocalUserDb('user-a');
  await db.kv.put({ key: 'k', value: 'v' });
  const listener = vi.fn();
  deletedElsewhereListeners.add(listener);

  // The delete only resolves once this tab's connection closes, so a hang here means the versionchange handler did not close it.
  const otherTab = new LocalUserDatabase('user-a');
  await otherTab.open();
  await otherTab.delete();

  expect(listener).toHaveBeenCalledOnce();
  expect(getLocalUserDb()).toBeNull();
  await expect(db.kv.put({ key: 'late', value: 'v' })).rejects.toThrow();
  expect(await Dexie.exists('test:user-a')).toBe(false);
});

/** The schema an older bundle still declares: version 1, without the Yjs tables. */
const versionOneStores = {
  kv: 'key',
  queries: 'id, scope',
  meta: 'key',
  blobs: '&id, attachmentId, organizationId, uploadStatus, [organizationId+source], [organizationId+uploadStatus]',
  downloadQueue: '&id, organizationId, [organizationId+status]',
  failedSync: '++id, mutationId, entityType, createdAt',
};

/** A tab still running a bundle from before the Yjs tables. Dexie's own handler is the one an upgrade meets there. */
function versionOneTab(ownerId: string) {
  const db = new Dexie(`test:${ownerId}`);
  db.version(1).stores(versionOneStores);
  return db;
}

const docKey = { entityType: 'attachment', entityId: 'doc-1' } as const;

it('opens a version 1 database as version 2 with every row intact, and the Yjs tables ready', async () => {
  const oldTab = versionOneTab('user-upgrade');
  await oldTab.table('kv').put({ key: 'seen', value: '{"a":1}' });
  await oldTab.table('queries').put({ id: 'rq:hash', scope: 'rq', queryHash: 'hash', queryKey: ['x'], state: {}, dataUpdatedAt: 1 });
  await oldTab.table('failedSync').add({ mutationId: 'm-1', entityType: 'attachment', createdAt: 1 });
  oldTab.close();

  const db = new LocalUserDatabase('user-upgrade');
  await db.open();

  expect(db.verno).toBe(2);
  const stores = [...Object.keys(versionOneStores), 'yDocs', 'yDocStates', 'yDocUpdates', 'unsaveableYDocs'];
  expect([...db.backendDB().objectStoreNames].sort()).toEqual(stores.sort());
  expect(await db.kv.get('seen')).toEqual({ key: 'seen', value: '{"a":1}' });
  expect(await db.queries.where('scope').equals('rq').primaryKeys()).toEqual(['rq:hash']);
  expect(await db.failedSync.count()).toBe(1);

  const record = {
    ...docKey,
    tenantId: 't',
    organizationId: 'o',
    generation: 'g',
    syncedVector: null,
    unsynced: 0 as const,
    bytes: 3,
    updateBytes: 0,
    updatedAt: 1,
    lastOpenedAt: 1,
  };
  await db.yDocs.put(record);
  await db.yDocStates.put({ ...docKey, state: new Uint8Array([1, 2, 3]) });
  const first = await db.yDocUpdates.add({ ...docKey, update: new Uint8Array([4]), local: 1, tabId: 'tab-1' });
  const second = await db.yDocUpdates.add({ ...docKey, update: new Uint8Array([5]), local: 0, tabId: 'tab-2' });
  await db.unsaveableYDocs.add({
    ...docKey,
    tenantId: 't',
    organizationId: 'o',
    generation: 'g',
    reason: 'deleted',
    state: new Uint8Array([6]),
    at: 1,
  });

  expect(await db.yDocs.get(['attachment', 'doc-1'])).toEqual(record);
  expect((await db.yDocStates.get(['attachment', 'doc-1']))?.state).toEqual(new Uint8Array([1, 2, 3]));
  expect(second).toBeGreaterThan(first);
  expect(await db.yDocUpdates.where('[entityType+entityId]').equals(['attachment', 'doc-1']).count()).toBe(2);
  expect(await db.unsaveableYDocs.where('[entityType+entityId]').equals(['attachment', 'doc-1']).count()).toBe(1);
  db.close();
});

it('must not block the upgrade on a tab still on version 1: it closes for it and reopens on its next query', async () => {
  const oldTab = versionOneTab('user-concurrent');
  await oldTab.table('kv').put({ key: 'seen', value: 'v1' });

  // The open only resolves once the old tab's connection closed, so a hang here means the upgrade was blocked.
  const db = new LocalUserDatabase('user-concurrent');
  await db.open();
  expect(db.verno).toBe(2);

  // The old tab reopens on the newer version and keeps working with its own tables.
  expect(await oldTab.table('kv').get('seen')).toEqual({ key: 'seen', value: 'v1' });
  await oldTab.table('kv').put({ key: 'late', value: 'v1' });
  expect(await db.kv.get('late')).toEqual({ key: 'late', value: 'v1' });
  oldTab.close();
  db.close();
});

it("an upgrade from another tab leaves this tab's database bound: only a delete unbinds it", async () => {
  const db = bindLocalUserDb('user-next');
  await db.kv.put({ key: 'k', value: 'v' });
  const listener = vi.fn();
  deletedElsewhereListeners.add(listener);

  // A tab with a newer bundle: the next version on top of this one.
  class NextVersion extends LocalUserDatabase {
    constructor(ownerId: string) {
      super(ownerId);
      this.version(3).stores({ extra: 'id' });
    }
  }
  const newerTab = new NextVersion('user-next');
  await newerTab.open();

  expect(listener).not.toHaveBeenCalled();
  expect(getLocalUserDb()).toBe(db);
  expect(await db.kv.get('k')).toEqual({ key: 'k', value: 'v' });
  newerTab.close();
  deletedElsewhereListeners.delete(listener);
});
