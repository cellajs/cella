import { afterEach, describe, expect, it } from 'vitest';
import { stubLocalStorage } from '~/query/tests/query-client-env';

// Real shared config, real sync-store, real query-client: the template's org grants declare the
// organization views of a first catchup and no registered views beside them.
stubLocalStorage();

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

  it('gives an organization the store has not seen its entry, so a first catchup declares its view', () => {
    registerEntityQueryKeys('attachment', createEntityKeys('attachment'));
    queryClient.setQueryData(['me', 'memberships'], { items: [orgMembership('org-1', 'admin'), orgMembership('org-2', 'member')] });
    // A fresh client: nothing stored, so a request built now would declare no view at all.
    expect(syncStore.getState().getCatchupViews(['attachment'])).toEqual([]);

    declareViewsFromMemberships();

    expect(syncStore.getState().getOrgTenantId('org-2')).toBe('tenant-1');
    expect(syncStore.getState().getCatchupViews(['attachment'])).toEqual([
      expect.objectContaining({ key: 'org-1:attachment', organizationId: 'org-1', cursor: 0 }),
      expect.objectContaining({ key: 'org-2:attachment', organizationId: 'org-2', cursor: 0 }),
    ]);
  });

  it('must not put the cursor of a known organization back', () => {
    registerEntityQueryKeys('attachment', createEntityKeys('attachment'));
    queryClient.setQueryData(['me', 'memberships'], { items: [orgMembership('org-1', 'admin')] });
    syncStore.getState().trackOrg('org-1', 'tenant-1');
    syncStore.getState().setOrgSeq('org-1', 'attachment', 7);

    declareViewsFromMemberships();

    expect(syncStore.getState().getOrgSeq('org-1', 'attachment')).toBe(7);
  });

  // The catchup processor reads only declared views, so a view that outlives its grant keeps requesting ranges the API refuses.
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
});
