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

describe('sync-store adoptGeneration', () => {
  afterEach(() => syncStore.getState().reset());

  const withCursors = () => {
    const store = syncStore.getState();
    store.setOrgSeq('org-1', 'attachment', 40);
    store.setChannelSeq('org-1', 'c1', 'attachment', 38);
    store.setSignalVersion('org-1', 'channel.deleted', 3);
  };

  it('puts every cursor back at 0 when the server names another generation than the one held, and only then', () => {
    withCursors();

    // Nothing to distrust: the first generation it hears, then the same one again.
    for (const generation of [3, 3]) syncStore.getState().adoptGeneration(generation);
    expect(syncStore.getState().getOrgSeq('org-1', 'attachment')).toBe(40);
    expect(syncStore.getState().refetchDueAt).toBeNull();

    // Another generation: the books were rebuilt, and no cursor of before says anything about them.
    syncStore.getState().adoptGeneration(4);

    const store = syncStore.getState();
    expect(store.generation).toBe(4);
    expect(store.getOrgSeq('org-1', 'attachment')).toBe(0);
    expect(store.getChannelSeq('org-1', 'c1', 'attachment')).toBe(0);
    expect(store.refetchDueAt).not.toBeNull();
    // Signal versions go too: rebuilt books may count them again from 0, so the catchup after the reset runs each once.
    expect(store.getSignalVersion('org-1', 'channel.deleted')).toBe(0);
  });
});
