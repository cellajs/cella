import 'fake-indexeddb/auto';
import { Dexie } from 'dexie';
import { expect, it, vi } from 'vitest';

vi.mock('shared', () => ({ appConfig: { slug: 'test' } }));

const { bindLocalUserDb, deletedElsewhereListeners, getLocalUserDb, LocalUserDatabase } = await import(
  '~/query/local-user-db'
);

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
