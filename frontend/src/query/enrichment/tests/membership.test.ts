import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  makeInfiniteData,
  makeMembership,
  mockAppConfig,
  mockComputeCan,
  mockGetRegisteredEntityTypes,
  mockHierarchy,
  mockPolicyMatrix,
  queryClient,
} from '~/query/enrichment/tests/test-setup';

vi.mock('shared', () => ({
  appConfig: mockAppConfig,
  hierarchy: mockHierarchy,
  isChannel: mockHierarchy.isChannel,
  computeCan: mockComputeCan,
  policyMatrix: mockPolicyMatrix,
}));
vi.mock('~/query/query-client', () => ({ queryClient }));
vi.mock('~/modules/me/query', () => ({ meKeys: { memberships: ['me', 'memberships'], invites: ['me', 'invites'] } }));
vi.mock('~/query/basic/entity-query-registry', () => ({ getRegisteredEntityTypes: mockGetRegisteredEntityTypes }));

const { initChannelEnrichment } = await import('~/query/enrichment/init-channel-enrichment');

describe('membership enrichment', () => {
  let unsubscribe: (() => void) | undefined;

  beforeEach(() => {
    queryClient.clear();
  });

  afterEach(() => {
    unsubscribe?.();
    queryClient.clear();
  });

  it("puts the caller's current membership on each channel row, whichever loads first, the list or the memberships", () => {
    const roles = () => (queryClient.getQueryData(['organization', 'list']) as any).pages[0].items.map((item: any) => item.membership?.role);
    unsubscribe = initChannelEnrichment();

    // The memberships arrive after the list...
    queryClient.setQueryData(['organization', 'list'], makeInfiniteData([{ id: 'org-1' }]));
    queryClient.setQueryData(['me', 'memberships'], { items: [makeMembership('org-1'), makeMembership('org-2', { role: 'admin' })] });
    expect(roles()).toEqual(['member']);

    // ...a list arrives after the memberships...
    queryClient.setQueryData(['organization', 'list'], makeInfiniteData([{ id: 'org-1' }, { id: 'org-2' }]));
    expect(roles()).toEqual(['member', 'admin']);

    // ...and a changed role reaches the cached rows.
    queryClient.setQueryData(['me', 'memberships'], {
      items: [makeMembership('org-1', { role: 'admin' }), makeMembership('org-2', { role: 'admin' })],
    });
    expect(roles()).toEqual(['admin', 'admin']);
  });
});
