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

const projectPath = '/$tenantId/$organizationSlug/project/$slug';

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

  it("opens the subject on the product's own param", () => {
    getProductDeepLink.mockReturnValue({ param: 'attachmentDialogId' });
    expect(getProductRoute(location)?.search).toEqual({ attachmentDialogId: 'subject-1' });
  });

  // A product rendered inside a host (a comment in its item): the host's param, at the context id.
  it('opens the host at the context id', () => {
    getProductDeepLink.mockReturnValue({ hostParam: 'itemId' });
    expect(getProductRoute(location)?.search).toEqual({ itemId: 'host-1' });
  });

  it('leaves the host out when the row has no context (inbox rows carry null)', () => {
    getProductDeepLink.mockReturnValue({ hostParam: 'itemId' });
    expect(getProductRoute({ ...location, contextId: null })?.search).toEqual({});
  });

  it('opens nothing for a product whose module declares no deep link', () => {
    expect(getProductRoute(location)?.search).toEqual({});
  });

  it('travels by id when the channel is not cached, and asks for no param without a subject', () => {
    expect(getProductRoute({ ...location, entityType: undefined, subjectId: undefined })).toEqual({
      to: projectPath,
      params: { tenantId: 'tenant1', organizationSlug: 'org-1', slug: 'project-1' },
      search: {},
    });
    expect(getProductDeepLink).not.toHaveBeenCalled();
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

  it('takes a cached channel the viewer lists under no parent to its own page by slug', () => {
    findInCache.mockReturnValue({ ...cachedProject, ancestorSlugs: { organization: 'acme' } });
    expect(getProductRoute({ ...location, entityType: undefined })).toEqual({
      to: projectPath,
      params: { tenantId: 'tenant1', organizationSlug: 'acme', slug: 'alpha' },
      search: {},
    });
  });

  it('routes nowhere for a channel type without a route', () => {
    expect(getProductRoute({ ...location, channelType: channelType('nowhere') })).toBeNull();
  });
});
