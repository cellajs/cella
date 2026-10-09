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

const { syncStore } = await import('./sync-store');

describe('sync-store declareSyncView (re-baseline rule)', () => {
  afterEach(() => syncStore.getState().reset());

  const base = { organizationId: 'org-1', prefixes: ['org-1/c1'], entityTypes: ['item'], depth: 'subtree' as const };

  it('keeps the cursor while the view identity is unchanged (prefix order irrelevant)', () => {
    const store = syncStore.getState();
    store.declareSyncView('v', { ...base, prefixes: ['org-1/c1', 'org-1/c2'] });
    store.setViewCursor('v', 42);
    store.declareSyncView('v', { ...base, prefixes: ['org-1/c2', 'org-1/c1'] });
    expect(syncStore.getState().getView('v')?.cursor).toBe(42);
  });

  it('resets the cursor when the prefix set grows (new member has skipped history)', () => {
    const store = syncStore.getState();
    store.declareSyncView('v', base);
    store.setViewCursor('v', 42);
    store.declareSyncView('v', { ...base, prefixes: ['org-1/c1', 'org-1/c9'] });
    expect(syncStore.getState().getView('v')?.cursor).toBe(0);
  });

  it('resets on depth or entity-type changes and rides the catchup request', () => {
    const store = syncStore.getState();
    store.declareSyncView('v', base);
    store.setViewCursor('v', 42);
    store.declareSyncView('v', { ...base, depth: 'self' });
    expect(syncStore.getState().getView('v')?.cursor).toBe(0);

    store.setViewCursor('v', 7);
    const views = syncStore.getState().getCatchupViews([]);
    expect(views).toEqual([{ key: 'v', ...base, depth: 'self', cursor: 7 }]);
  });
});

describe('sync-store getCatchupViews', () => {
  afterEach(() => syncStore.getState().reset());

  it('declares one org-prefix view per (org, entityType) with the org-slot cursor', () => {
    const store = syncStore.getState();
    store.setOrgTenantId('org-1', 'tenant-1');
    store.setOrgSeq('org-1', 'attachment', 42);
    store.setOrgTenantId('org-2', 'tenant-2');

    const views = syncStore.getState().getCatchupViews(['attachment']);

    expect(views).toEqual([
      { key: 'org-1:attachment', organizationId: 'org-1', prefixes: ['org-1'], entityTypes: ['attachment'], cursor: 42 },
      { key: 'org-2:attachment', organizationId: 'org-2', prefixes: ['org-2'], entityTypes: ['attachment'], cursor: 0 },
    ]);
  });

  it('child-channel-view cursors never leak into the org-view cursor (they cover their subtree only)', () => {
    const store = syncStore.getState();
    store.setOrgTenantId('org-1', 'tenant-1');
    store.setChannelSeq('org-1', 'project-9', 'attachment', 4700);

    const views = syncStore.getState().getCatchupViews(['attachment']);
    // Org slot untouched → baseline cursor 0, despite the live child cursor.
    expect(views).toEqual([{ key: 'org-1:attachment', organizationId: 'org-1', prefixes: ['org-1'], entityTypes: ['attachment'], cursor: 0 }]);
  });

  it('org-homed live channel views (channelId === orgId) share the org slot and drive the cursor', () => {
    const store = syncStore.getState();
    store.setOrgTenantId('org-1', 'tenant-1');
    store.setChannelSeq('org-1', 'org-1', 'attachment', 88);

    const views = syncStore.getState().getCatchupViews(['attachment']);
    expect(views[0].cursor).toBe(88);
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
    store.setKnownSeq('c1', 'item', 41);
  };

  it('takes the first generation it hears without touching a cursor', () => {
    withCursors();

    expect(syncStore.getState().adoptGeneration(3)).toBe(false);

    expect(syncStore.getState().generation).toBe(3);
    expect(syncStore.getState().getOrgSeq('org-1', 'item')).toBe(40);
    expect(syncStore.getState().getView('v1')?.cursor).toBe(40);
  });

  it('keeps everything while the generation stays the same, or the server names none', () => {
    syncStore.getState().adoptGeneration(3);
    withCursors();

    expect(syncStore.getState().adoptGeneration(3)).toBe(false);
    expect(syncStore.getState().adoptGeneration(undefined)).toBe(false);

    expect(syncStore.getState().getOrgSeq('org-1', 'item')).toBe(40);
    expect(syncStore.getState().generation).toBe(3);
  });

  it('must not keep a cursor of the books before a rebuild: another generation puts every one back at 0', () => {
    syncStore.getState().adoptGeneration(3);
    withCursors();

    expect(syncStore.getState().adoptGeneration(4)).toBe(true);

    const store = syncStore.getState();
    expect(store.generation).toBe(4);
    expect(store.getOrgSeq('org-1', 'item')).toBe(0);
    expect(store.getChannelSeq('org-1', 'c1', 'item')).toBe(0);
    expect(store.getView('v1')?.cursor).toBe(0);
    expect(store.getKnownSeq('c1', 'item')).toBe(0);
    // The view itself stays declared: only where it stands is forgotten.
    expect(store.getView('v1')?.prefixes).toEqual(['org-1/c1']);
  });
});
