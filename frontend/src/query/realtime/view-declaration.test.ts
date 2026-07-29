import { afterEach, describe, expect, it, vi } from 'vitest';

// Real shared config, real sync-store, real query-client: this suite proves the TEMPLATE
// derives no registered views (catchup requests stay byte-identical to the org baseline).
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

const { createEntityKeys } = await import('~/query/basic/create-query-keys');
const { registerEntityQueryKeys } = await import('~/query/basic/entity-query-registry');
const { queryClient } = await import('~/query/query-client');
const { syncStore } = await import('~/query/realtime/sync-store');
const { declareViewsFromMemberships } = await import('./view-declaration');

const orgMembership = (organizationId: string, role: 'admin' | 'member') => ({
  id: `mem-${organizationId}-${role}`,
  tenantId: 'tenant-1',
  channelType: 'organization' as const,
  channelId: organizationId,
  userId: 'user-1',
  role,
  archived: false,
  muted: false,
  displayOrder: 0,
  organizationId,
});

describe('declareViewsFromMemberships (template equivalence)', () => {
  afterEach(() => {
    queryClient.clear();
    syncStore.getState().reset();
  });

  it('derives NO registered views for org-homed template grants: catchup stays org-view-only', () => {
    registerEntityQueryKeys('attachment', createEntityKeys('attachment'));
    queryClient.setQueryData(['me', 'memberships'], {
      items: [orgMembership('org-1', 'admin'), orgMembership('org-2', 'member')],
    });
    syncStore.getState().setOrgTenantId('org-1', 'tenant-1');
    syncStore.getState().setOrgSeq('org-1', 'attachment', 7);

    const before = syncStore.getState().getCatchupViews(['attachment']);
    declareViewsFromMemberships();
    const after = syncStore.getState().getCatchupViews(['attachment']);

    // Org subtree views duplicate the built-in baseline, so the registry stays empty and the
    // request is unchanged.
    expect(syncStore.getState().views).toEqual({});
    expect(after).toEqual(before);
  });

  it('removes registered views whose grant disappeared', () => {
    registerEntityQueryKeys('attachment', createEntityKeys('attachment'));
    syncStore.getState().declareSyncView('org-1:attachment:self', {
      organizationId: 'org-1',
      prefixes: ['org-1/course-9'],
      entityTypes: ['attachment'],
      depth: 'self',
    });
    queryClient.setQueryData(['me', 'memberships'], { items: [orgMembership('org-1', 'admin')] });

    declareViewsFromMemberships();

    expect(syncStore.getState().getView('org-1:attachment:self')).toBeUndefined();
  });

  it('handles a missing memberships cache without touching declared state', () => {
    registerEntityQueryKeys('attachment', createEntityKeys('attachment'));
    expect(() => declareViewsFromMemberships()).not.toThrow();
    expect(syncStore.getState().views).toEqual({});
  });
});
