import 'fake-indexeddb/auto';
import { Dexie } from 'dexie';
import { expect, it, vi } from 'vitest';

vi.mock('shared', () => ({ appConfig: { slug: 'test' } }));

const { bindLocalUserDb, getLocalUserDb, LocalUserDatabase } = await import('~/query/local-user-db');

it("another tab's delete closes and unbinds this tab's database for good, while another tab's upgrade leaves it bound", async () => {
  const db = bindLocalUserDb('user-a');
  await db.kv.put({ key: 'k', value: 'v' });

  // A tab with a newer bundle upgrades the database to the next version: this tab stays signed in on it.
  class NextVersion extends LocalUserDatabase {
    constructor(userId: string) {
      super(userId);
      this.version(4).stores({ extra: 'id' });
    }
  }
  const newerTab = new NextVersion('user-a');
  await newerTab.open();

  expect(getLocalUserDb()).toBe(db);
  expect(await db.kv.get('k')).toEqual({ key: 'k', value: 'v' });

  // A hard sign-out there deletes it. The delete only resolves once this tab's connection closes, so a hang here means
  // the versionchange handler did not close it.
  await newerTab.delete();

  expect(getLocalUserDb()).toBeNull();
  await expect(db.kv.put({ key: 'late', value: 'v' })).rejects.toThrow();
  expect(await Dexie.exists('test:user-a')).toBe(false);
});
