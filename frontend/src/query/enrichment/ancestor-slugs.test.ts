import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  makeInfiniteData,
  makeMembership,
  mockAccessPolicies,
  mockAppConfig,
  mockComputeCan,
  mockGetEntityQueryKeys,
  mockGetRegisteredEntityTypes,
  mockHasEntityQueryKeys,
  mockHierarchy,
  mockRegisterEntityQueryKeys,
  queryClient,
} from '~/query/enrichment/test-setup';

vi.mock('shared', () => ({
  appConfig: mockAppConfig,
  hierarchy: mockHierarchy,
  isContextEntity: (type: string) => mockAppConfig.contextEntityTypes.includes(type),
  computeCan: mockComputeCan,
  accessPolicies: mockAccessPolicies,
}));
vi.mock('~/query/query-client', () => ({ queryClient }));
vi.mock('~/modules/me/query', () => ({ meKeys: { memberships: ['me', 'memberships'] } }));
vi.mock('~/query/basic', () => ({
  getEntityQueryKeys: mockGetEntityQueryKeys,
  getRegisteredEntityTypes: mockGetRegisteredEntityTypes,
  hasEntityQueryKeys: mockHasEntityQueryKeys,
  registerEntityQueryKeys: mockRegisterEntityQueryKeys,
}));

const { initContextEntityEnrichment } = await import('~/query/enrichment/init');

describe('ancestor slug enrichment', () => {
  let unsubscribe: (() => void) | undefined;

  beforeEach(() => {
    queryClient.clear();
  });

  afterEach(() => {
    unsubscribe?.();
    queryClient.clear();
  });

  it('enriches child entity with ancestor slug when parent is in cache', () => {
    unsubscribe = initContextEntityEnrichment();

    queryClient.setQueryData(['organization', 'list'], makeInfiniteData([{ id: 'org-1', slug: 'acme-corp' } as any]));

    queryClient.setQueryData(['me', 'memberships'], {
      items: [
        makeMembership('org-1'),
        makeMembership('proj-1', { contextType: 'project', organizationId: 'org-1', projectId: 'proj-1' }),
      ],
    });

    queryClient.setQueryData(
      ['project', 'list'],
      makeInfiniteData([{ id: 'proj-1', slug: 'my-project', organizationId: 'org-1' } as any]),
    );

    const data = queryClient.getQueryData(['project', 'list']) as any;
    const item = data.pages[0].items[0];
    expect(item.ancestorSlugs).toBeDefined();
    expect(item.ancestorSlugs.organization).toBe('acme-corp');
  });

  it('does not set ancestorSlugs for root context entities', () => {
    unsubscribe = initContextEntityEnrichment();

    queryClient.setQueryData(['me', 'memberships'], {
      items: [makeMembership('org-1')],
    });

    queryClient.setQueryData(['organization', 'list'], makeInfiniteData([{ id: 'org-1', slug: 'acme-corp' } as any]));

    const data = queryClient.getQueryData(['organization', 'list']) as any;
    const item = data.pages[0].items[0];
    expect(item.ancestorSlugs).toBeUndefined();
  });

  it('falls back to ancestor ID when parent slug is not in cache, then updates when parent loads', () => {
    unsubscribe = initContextEntityEnrichment();

    queryClient.setQueryData(['me', 'memberships'], {
      items: [
        makeMembership('org-1'),
        makeMembership('proj-1', { contextType: 'project', organizationId: 'org-1', projectId: 'proj-1' }),
      ],
    });

    queryClient.setQueryData(
      ['project', 'list'],
      makeInfiniteData([{ id: 'proj-1', slug: 'my-project', organizationId: 'org-1' } as any]),
    );

    let data = queryClient.getQueryData(['project', 'list']) as any;
    expect(data.pages[0].items[0].ancestorSlugs?.organization).toBe('org-1');

    queryClient.setQueryData(['organization', 'list'], makeInfiniteData([{ id: 'org-1', slug: 'acme-corp' } as any]));

    data = queryClient.getQueryData(['project', 'list']) as any;
    expect(data.pages[0].items[0].ancestorSlugs?.organization).toBe('acme-corp');
  });

  it('preserves reference when ancestor slugs have not changed', () => {
    unsubscribe = initContextEntityEnrichment();

    queryClient.setQueryData(['organization', 'list'], makeInfiniteData([{ id: 'org-1', slug: 'acme-corp' } as any]));

    queryClient.setQueryData(['me', 'memberships'], {
      items: [
        makeMembership('org-1'),
        makeMembership('proj-1', { contextType: 'project', organizationId: 'org-1', projectId: 'proj-1' }),
      ],
    });

    queryClient.setQueryData(
      ['project', 'list'],
      makeInfiniteData([{ id: 'proj-1', slug: 'my-project', organizationId: 'org-1' } as any]),
    );

    const first = queryClient.getQueryData(['project', 'list']);

    queryClient.setQueryData(['organization', 'list'], makeInfiniteData([{ id: 'org-1', slug: 'acme-corp' } as any]));

    const second = queryClient.getQueryData(['project', 'list']);
    expect(second).toBe(first);
  });
});
