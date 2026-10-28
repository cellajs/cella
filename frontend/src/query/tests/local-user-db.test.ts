import 'fake-indexeddb/auto';
import { Dexie } from 'dexie';
import { expect, it, vi } from 'vitest';

vi.mock('shared', () => ({ appConfig: { slug: 'test' } }));

const { bindLocalUserDb, deletedElsewhereListeners, getLocalUserDb, LocalUserDatabase } = await import('~/query/local-user-db');

it("another tab's delete closes this tab's database for good and signs it out, while another tab's upgrade leaves it bound", async () => {
  const db = bindLocalUserDb('user-a');
  await db.kv.put({ key: 'k', value: 'v' });
  const listener = vi.fn();
  deletedElsewhereListeners.add(listener);

  // A tab with a newer bundle upgrades the database to the next version: this tab stays signed in on it.
  class NextVersion extends LocalUserDatabase {
    constructor(userId: string) {
      super(userId);
      this.version(3).stores({ extra: 'id' });
    }
  }
  const newerTab = new NextVersion('user-a');
  await newerTab.open();

  expect(listener).not.toHaveBeenCalled();
  expect(getLocalUserDb()).toBe(db);
  expect(await db.kv.get('k')).toEqual({ key: 'k', value: 'v' });

  // A hard sign-out there deletes it. The delete only resolves once this tab's connection closes, so a hang here means
  // the versionchange handler did not close it.
  await newerTab.delete();

  expect(listener).toHaveBeenCalledOnce();
  expect(getLocalUserDb()).toBeNull();
  await expect(db.kv.put({ key: 'late', value: 'v' })).rejects.toThrow();
  expect(await Dexie.exists('test:user-a')).toBe(false);
});
