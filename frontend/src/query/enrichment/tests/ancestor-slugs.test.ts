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

describe('ancestor slug enrichment', () => {
  let unsubscribe: (() => void) | undefined;

  beforeEach(() => {
    queryClient.clear();
  });

  afterEach(() => {
    unsubscribe?.();
    queryClient.clear();
  });

  // The wide fixture has raak's shape: a project's parent is the organization, and the menu nests it under a workspace.
  it("keeps a project's ancestor slugs current, its parent's and its menu parent's, the ids standing in until a slug is cached", () => {
    const ancestorSlugs = () => (queryClient.getQueryData(['project', 'list']) as any).pages[0].items[0].ancestorSlugs;
    unsubscribe = initChannelEnrichment();

    queryClient.setQueryData(['organization', 'list'], makeInfiniteData([{ id: 'org-1', slug: 'acme-corp' } as any]));
    queryClient.setQueryData(['me', 'memberships'], {
      items: [
        makeMembership('org-1'),
        makeMembership('proj-1', { channelType: 'project', organizationId: 'org-1', projectId: 'proj-1', workspaceId: 'ws-1' }),
      ],
    });
    queryClient.setQueryData(['project', 'list'], makeInfiniteData([{ id: 'proj-1', slug: 'my-project', organizationId: 'org-1' } as any]));
    expect(ancestorSlugs()).toEqual({ organization: 'acme-corp', workspace: 'ws-1' });

    // The workspace list loads after the project's...
    queryClient.setQueryData(['workspace', 'list'], makeInfiniteData([{ id: 'ws-1', slug: 'my-workspace' } as any]));
    expect(ancestorSlugs()).toEqual({ organization: 'acme-corp', workspace: 'my-workspace' });

    // ...and the organization changes its slug.
    queryClient.setQueryData(['organization', 'list'], makeInfiniteData([{ id: 'org-1', slug: 'acme' } as any]));
    expect(ancestorSlugs()).toEqual({ organization: 'acme', workspace: 'my-workspace' });
  });
});
