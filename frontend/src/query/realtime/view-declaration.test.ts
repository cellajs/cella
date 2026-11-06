import { afterEach, describe, expect, it } from 'vitest';
import { stubLocalStorage } from '~/query/tests/query-client-env';

// Real shared config, real sync-store, real query-client: the cached memberships decide the
// organization views of a first catchup.
stubLocalStorage();

const { createEntityKeys } = await import('~/query/basic/create-query-keys');
const { registerEntityQueryKeys } = await import('~/query/basic/entity-query-registry');
const { queryClient } = await import('~/query/query-client');
const { syncStore } = await import('~/query/realtime/sync-store');
const { declareViewsFromMemberships } = await import('~/query/realtime/view-declaration');

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

describe('declareViewsFromMemberships', () => {
  afterEach(() => {
    queryClient.clear();
    syncStore.getState().reset();
  });

  it('gives an organization the store has not seen its entry, so a first catchup declares its view', () => {
    registerEntityQueryKeys('attachment', createEntityKeys('attachment'));
    queryClient.setQueryData(['me', 'memberships'], { results: [orgMembership('org-1', 'admin'), orgMembership('org-2', 'member')] });
    // A fresh client: nothing stored, so a request built now would declare no view at all.
    expect(syncStore.getState().getCatchupViews(['attachment'])).toEqual([]);

    declareViewsFromMemberships();

    expect(syncStore.getState().getCatchupViews(['attachment'])).toEqual([
      { organizationId: 'org-1', entityType: 'attachment', cursor: 0 },
      { organizationId: 'org-2', entityType: 'attachment', cursor: 0 },
    ]);
  });

  it('must not put the cursor of a known organization back', () => {
    registerEntityQueryKeys('attachment', createEntityKeys('attachment'));
    queryClient.setQueryData(['me', 'memberships'], { results: [orgMembership('org-1', 'admin')] });
    syncStore.getState().setOrgSeq('org-1', 'attachment', 7);

    declareViewsFromMemberships();

    expect(syncStore.getState().getOrgSeq('org-1', 'attachment')).toBe(7);
  });
});
