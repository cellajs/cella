import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeInfiniteData, mockAppConfig, mockGetRegisteredEntityTypes, mockHierarchy, queryClient } from '~/query/enrichment/tests/test-setup';

vi.mock('shared', () => ({
  appConfig: mockAppConfig,
  hierarchy: mockHierarchy,
  isChannel: mockHierarchy.isChannel,
}));
vi.mock('~/query/query-client', () => ({ queryClient }));
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

  it("keeps a project's ancestor slugs current from its own id columns, the ids standing in until a slug is cached", () => {
    const ancestorSlugs = () => (queryClient.getQueryData(['project', 'list']) as any).pages[0].results[0].ancestorSlugs;
    unsubscribe = initChannelEnrichment();

    queryClient.setQueryData(['project', 'list'], makeInfiniteData([{ id: 'proj-1', slug: 'my-project', organizationId: 'org-1' }]));
    expect(ancestorSlugs()).toEqual({ organization: 'org-1' });

    // The organization list loads after the project's...
    queryClient.setQueryData(['organization', 'list'], makeInfiniteData([{ id: 'org-1', slug: 'acme-corp' }]));
    expect(ancestorSlugs()).toEqual({ organization: 'acme-corp' });

    // ...and the organization changes its slug.
    queryClient.setQueryData(['organization', 'list'], makeInfiniteData([{ id: 'org-1', slug: 'acme' }]));
    expect(ancestorSlugs()).toEqual({ organization: 'acme' });
  });
});
