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

const { useSyncStore } = await import('./sync-store');

describe('sync-store getCatchupViews', () => {
  afterEach(() => useSyncStore.getState().reset());

  it('declares one org-prefix view per (org, entityType) with the org-slot cursor', () => {
    const store = useSyncStore.getState();
    store.setOrgTenantId('org-1', 'tenant-1');
    store.setOrgSeq('org-1', 'attachment', 42);
    store.setOrgTenantId('org-2', 'tenant-2');

    const views = useSyncStore.getState().getCatchupViews(['attachment']);

    expect(views).toEqual([
      {
        key: 'org-1:attachment',
        organizationId: 'org-1',
        prefixes: ['org-1'],
        entityTypes: ['attachment'],
        cursor: 42,
      },
      { key: 'org-2:attachment', organizationId: 'org-2', prefixes: ['org-2'], entityTypes: ['attachment'], cursor: 0 },
    ]);
  });

  it('child-scope watermarks never leak into the org-view cursor (they cover their subtree only)', () => {
    const store = useSyncStore.getState();
    store.setOrgTenantId('org-1', 'tenant-1');
    store.setChannelSeq('org-1', 'project-9', 'attachment', 4700);

    const views = useSyncStore.getState().getCatchupViews(['attachment']);
    // Org slot untouched → baseline cursor 0, despite the live child watermark.
    expect(views).toEqual([
      { key: 'org-1:attachment', organizationId: 'org-1', prefixes: ['org-1'], entityTypes: ['attachment'], cursor: 0 },
    ]);
  });

  it('org-homed live scopes (channelId === orgId) share the org slot and drive the cursor', () => {
    const store = useSyncStore.getState();
    store.setOrgTenantId('org-1', 'tenant-1');
    store.setChannelSeq('org-1', 'org-1', 'attachment', 88);

    const views = useSyncStore.getState().getCatchupViews(['attachment']);
    expect(views[0].cursor).toBe(88);
  });
});
