import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('shared', () => ({ appConfig: { slug: 'test-app' } }));

// localStorage isn't present in the node test env — back it with a Map.
const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => store.set(k, v),
  removeItem: (k: string) => store.delete(k),
  clear: () => store.clear(),
});

const { ANON_OWNER, getOwnerId, getQueryScope, userScopedName } = await import('~/lib/storage-scope');

/** Persist a user-store blob the way zustand persist would. */
function setPersistedUser(state: unknown) {
  store.set('test-app-user', JSON.stringify({ state, version: 11 }));
}

describe('storage-scope', () => {
  beforeEach(() => store.clear());

  describe('getOwnerId', () => {
    it('returns anon when no user is persisted', () => {
      expect(getOwnerId()).toBe(ANON_OWNER);
    });

    it('reads lastUser.id from the persisted user store', () => {
      setPersistedUser({ lastUser: { id: 'user-123', email: 'a@b.c' } });
      expect(getOwnerId()).toBe('user-123');
    });

    it('falls back to user.id when lastUser is absent', () => {
      setPersistedUser({ user: { id: 'user-456' } });
      expect(getOwnerId()).toBe('user-456');
    });

    it('returns anon on corrupt JSON', () => {
      store.set('test-app-user', '{not valid json');
      expect(getOwnerId()).toBe(ANON_OWNER);
    });

    it('returns anon when the id is empty/non-string', () => {
      setPersistedUser({ lastUser: { id: '' } });
      expect(getOwnerId()).toBe(ANON_OWNER);
    });
  });

  describe('namespacing', () => {
    it('userScopedName encodes the slug and current owner', () => {
      setPersistedUser({ lastUser: { id: 'u1' } });
      expect(userScopedName('drafts')).toBe('test-app-drafts:u1');
      expect(getQueryScope()).toBe('rq:u1');
    });

    it('produces distinct keys for different owners (isolation property)', () => {
      setPersistedUser({ lastUser: { id: 'alice' } });
      const aliceDrafts = userScopedName('drafts');
      const aliceScope = getQueryScope();

      setPersistedUser({ lastUser: { id: 'bob' } });
      expect(userScopedName('drafts')).not.toBe(aliceDrafts);
      expect(getQueryScope()).not.toBe(aliceScope);
    });
  });
});
