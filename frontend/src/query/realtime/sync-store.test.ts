import { afterEach, describe, expect, it, vi } from 'vitest';

vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
vi.stubGlobal('navigator', { onLine: true });
vi.stubGlobal('localStorage', {
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  key: vi.fn(() => null),
  length: 0,
});

const { syncStore } = await import('~/query/realtime/sync-store');

describe('sync-store declareSyncView (re-baseline rule)', () => {
  afterEach(() => syncStore.getState().reset());

  const base = { organizationId: 'org-1', prefixes: ['org-1/c1', 'org-1/c2'], entityTypes: ['item'], depth: 'subtree' as const };
  /** The cursor the view sends in the next catchup request. */
  const requestCursor = () =>
    syncStore
      .getState()
      .getCatchupViews([])
      .find((view) => view.key === 'v')?.cursor;

  it('keeps the cursor a view sends while its identity holds, and starts it from 0 once its prefixes, depth or types change', () => {
    const store = syncStore.getState();
    store.declareSyncView('v', base);
    store.setViewCursor('v', 42);

    // Declared again before every catchup, in another prefix order: the same view.
    store.declareSyncView('v', { ...base, prefixes: ['org-1/c2', 'org-1/c1'] });
    expect(requestCursor()).toBe(42);

    // A grown prefix set has history before the cursor that a range read would skip; so has another depth or type.
    for (const change of [{ prefixes: [...base.prefixes, 'org-1/c9'] }, { depth: 'self' as const }, { entityTypes: ['item', 'other'] }]) {
      store.declareSyncView('v', base);
      store.setViewCursor('v', 42);
      store.declareSyncView('v', { ...base, ...change });
      expect(requestCursor(), JSON.stringify(change)).toBe(0);
    }
  });
});

describe('sync-store adoptGeneration', () => {
  afterEach(() => syncStore.getState().reset());

  const view = { organizationId: 'org-1', prefixes: ['org-1/c1'], entityTypes: ['item'], depth: 'subtree' as const };
  const withCursors = () => {
    const store = syncStore.getState();
    store.setOrgSeq('org-1', 'item', 40);
    store.setChannelSeq('org-1', 'c1', 'item', 38);
    store.declareSyncView('v1', view);
    store.setViewCursor('v1', 40);
  };

  it('puts every cursor back at 0 when the server names another generation than the one held, and only then', () => {
    withCursors();

    // Nothing to distrust: the first generation it hears, the same one again, or none named.
    for (const generation of [3, 3, undefined]) expect(syncStore.getState().adoptGeneration(generation)).toBe(false);
    expect(syncStore.getState().getOrgSeq('org-1', 'item')).toBe(40);
    expect(syncStore.getState().getView('v1')?.cursor).toBe(40);

    // Another generation: the books were rebuilt, and no cursor of before says anything about them.
    expect(syncStore.getState().adoptGeneration(4)).toBe(true);

    const store = syncStore.getState();
    expect(store.generation).toBe(4);
    expect(store.getOrgSeq('org-1', 'item')).toBe(0);
    expect(store.getChannelSeq('org-1', 'c1', 'item')).toBe(0);
    expect(store.getView('v1')?.cursor).toBe(0);
    // The view itself stays declared: only where it stands is forgotten.
    expect(store.getView('v1')?.prefixes).toEqual(['org-1/c1']);
  });
});
