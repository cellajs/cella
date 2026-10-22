import type { ChannelEntityType } from 'shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getProductRoute } from '~/utils/channel-route';

const { getProductDeepLink, findInCache } = vi.hoisted(() => ({
  getProductDeepLink: vi.fn((): { param?: string; hostParam?: string } => ({})),
  findInCache: vi.fn((): Record<string, unknown> | undefined => undefined),
}));

// Two channels below the organization, as an app declares them: the project lists under a workspace in the menu.
vi.mock('~/routes-config', () => ({
  channelRouteConfig: {
    organization: { path: '/$tenantId/$organizationSlug/organization', paramName: 'organizationSlug' },
    workspace: { path: '/$tenantId/$organizationSlug/workspace/$slug', paramName: 'slug' },
    project: {
      path: '/$tenantId/$organizationSlug/project/$slug',
      paramName: 'slug',
      subitemOf: { entityType: 'workspace', searchParam: 'projectSlug' },
    },
  },
}));
vi.mock('~/lib/entity-modules', () => ({ getProductDeepLink }));
vi.mock('~/query/basic/find-in-list-cache', () => ({ findInCache }));

/** The test's channel types are the app's, not cella's. */
const channelType = (type: string) => type as ChannelEntityType;

const location = {
  tenantId: 'tenant1',
  organizationId: 'org-1',
  channelType: channelType('project'),
  channelId: 'project-1',
  entityType: 'attachment' as const,
  subjectId: 'subject-1',
  contextId: 'host-1',
};

/** A project row as the enrichment leaves it in the list cache, listed under a workspace by the viewer's membership. */
const cachedProject = {
  id: 'project-1',
  entityType: 'project',
  slug: 'alpha',
  tenantId: 'tenant1',
  organizationId: 'org-1',
  ancestorSlugs: { organization: 'acme', workspace: 'design' },
};

describe('getProductRoute', () => {
  beforeEach(() => {
    getProductDeepLink.mockReturnValue({});
    findInCache.mockReturnValue(undefined);
  });

  // A product rendered inside a host (a comment in its item): the host's param, at the context id.
  it('opens the host at the context id', () => {
    getProductDeepLink.mockReturnValue({ hostParam: 'itemId' });
    expect(getProductRoute(location)?.search).toEqual({ itemId: 'host-1' });
  });

  it("lands a cached subitem on its parent's page by slug, the subject opened there", () => {
    findInCache.mockReturnValue(cachedProject);
    getProductDeepLink.mockReturnValue({ param: 'attachmentDialogId' });
    expect(getProductRoute(location)).toEqual({
      to: '/$tenantId/$organizationSlug/workspace/$slug',
      params: { tenantId: 'tenant1', organizationSlug: 'acme', slug: 'design' },
      search: { projectSlug: 'alpha', attachmentDialogId: 'subject-1' },
    });
    expect(findInCache).toHaveBeenCalledWith('project', 'project-1');
  });
});
