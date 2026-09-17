import 'fake-indexeddb/auto';
import { Dexie } from 'dexie';
import { describe, expect, it, vi } from 'vitest';

vi.mock('shared', () => ({ appConfig: { slug: 'test' } }));

const { bindLocalUserDb, closeLocalUserDb, getLocalUserDb, LocalUserDatabase, subscribeLocalUserDbDeletedElsewhere } =
  await import('~/query/local-user-db');

describe('localUserDb: delete from another tab', () => {
  it('closes for good, unbinds, notifies, and lets the delete finish', async () => {
    const db = bindLocalUserDb('user-a');
    await db.kv.put({ key: 'k', value: 'v' });

    const listener = vi.fn();
    const unsubscribe = subscribeLocalUserDbDeletedElsewhere(listener);

    // Another tab holds its own connection and runs a hard sign-out. The delete only resolves once this
    // tab's connection closes, so a hang here means the versionchange handler did not close it.
    const otherTab = new LocalUserDatabase('user-a');
    await otherTab.open();
    await otherTab.delete();

    expect(listener).toHaveBeenCalledOnce();
    expect(getLocalUserDb()).toBeNull();

    // A late write from this tab must not recreate the database.
    await expect(db.kv.put({ key: 'late', value: 'v' })).rejects.toThrow();
    expect(await Dexie.exists('test:user-a')).toBe(false);

    unsubscribe();
  });

  it('ignores a delete of a database this tab no longer has bound', async () => {
    const db = bindLocalUserDb('user-b');
    await db.open();
    closeLocalUserDb();

    const listener = vi.fn();
    const unsubscribe = subscribeLocalUserDbDeletedElsewhere(listener);

    const otherTab = new LocalUserDatabase('user-b');
    await otherTab.open();
    await otherTab.delete();

    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });
});
