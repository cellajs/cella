import type { ChannelEntityType } from 'shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type ChannelRoute, getProductRoute, type ProductLocation } from '~/utils/channel-route';

const { getProductDeepLink, getChannelProductRoute, findInCache } = vi.hoisted(() => ({
  getProductDeepLink: vi.fn((): { param?: string; hostParam?: string } => ({})),
  getChannelProductRoute: vi.fn((): ((location: ProductLocation) => ChannelRoute | undefined) | undefined => undefined),
  findInCache: vi.fn((): Record<string, unknown> | undefined => undefined),
}));

vi.mock('~/routes-config', () => ({
  channelRouteConfig: {
    organization: { path: '/$tenantId/$organizationSlug/organization', paramName: 'organizationSlug' },
    project: { path: '/$tenantId/$organizationSlug/project/$slug', paramName: 'slug' },
  },
}));
// The hierarchy those routes belong to: the ancestor walk reads the same channels in every app.
vi.mock('shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shared')>();
  const roles = actual.createRoleRegistry(['member'] as const);
  const hierarchy = actual
    .createEntityHierarchy(roles)
    .user()
    .organization({ roles: roles.all })
    .channel('project', { parent: 'organization', roles: roles.all })
    .product('attachment', { parent: 'project' })
    .build();
  return {
    ...actual,
    appConfig: { ...actual.appConfig, entityIdColumnKeys: hierarchy.idColumnKeys },
    hierarchy,
    isChannel: hierarchy.isChannel,
    isProduct: hierarchy.isProduct,
  };
});
vi.mock('~/lib/entity-modules', () => ({ getProductDeepLink, getChannelProductRoute }));
vi.mock('~/query/basic/find-in-list-cache', () => ({ findInCache }));

/** The test's channel types are the app's, not cella's. */
const channelType = (type: string) => type as ChannelEntityType;

const location = {
  tenantId: 'tenant1',
  organizationId: 'org-1',
  channelType: channelType('project'),
  channelId: 'project-1',
  productType: 'attachment' as const,
  subjectId: 'subject-1',
  contextId: 'host-1',
};

/** A project row as the enrichment leaves it in the list cache. */
const cachedProject = {
  id: 'project-1',
  entityType: 'project',
  slug: 'alpha',
  tenantId: 'tenant1',
  organizationId: 'org-1',
  ancestorSlugs: { organization: 'acme' },
};

describe('getProductRoute', () => {
  beforeEach(() => {
    getProductDeepLink.mockReturnValue({});
    getChannelProductRoute.mockReturnValue(undefined);
    findInCache.mockReturnValue(undefined);
  });

  // A product rendered inside a host (a comment in its item): the host's param, at the context id.
  it('opens the host at the context id', () => {
    getProductDeepLink.mockReturnValue({ hostParam: 'itemId' });
    expect(getProductRoute(location)?.search).toEqual({ itemId: 'host-1' });
  });

  it("opens a cached channel's own page by slug, the subject opened there", () => {
    findInCache.mockReturnValue(cachedProject);
    getProductDeepLink.mockReturnValue({ param: 'attachmentDialogId' });
    expect(getProductRoute(location)).toEqual({
      to: '/$tenantId/$organizationSlug/project/$slug',
      params: { tenantId: 'tenant1', organizationSlug: 'acme', slug: 'alpha' },
      search: { attachmentDialogId: 'subject-1' },
    });
    expect(findInCache).toHaveBeenCalledWith('project', 'project-1');
  });

  it("opens the page the channel's module names, its search kept beside the subject's", () => {
    const pageRoute = {
      to: '/$tenantId/$organizationSlug/organization',
      params: { tenantId: 'tenant1', organizationSlug: 'acme' },
      search: { projectSlug: 'alpha' },
    } satisfies ChannelRoute;
    getChannelProductRoute.mockReturnValue(() => pageRoute);
    getProductDeepLink.mockReturnValue({ param: 'attachmentDialogId' });
    expect(getProductRoute(location)).toEqual({ ...pageRoute, search: { projectSlug: 'alpha', attachmentDialogId: 'subject-1' } });
    expect(getChannelProductRoute).toHaveBeenCalledWith('project');
  });
});
