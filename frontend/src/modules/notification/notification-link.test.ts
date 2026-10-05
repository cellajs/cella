import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getNotificationRoute } from '~/modules/notification/notification-link';

const { getProductDeepLink } = vi.hoisted(() => ({
  getProductDeepLink: vi.fn((): { param?: string; hostParam?: string } => ({})),
}));

vi.mock('~/routes-config', () => ({
  channelRouteConfig: { organization: { path: '/$tenantId/$organizationSlug/organization', paramName: 'organizationSlug' } },
}));
vi.mock('~/lib/entity-modules', () => ({ getProductDeepLink }));

const target = {
  tenantId: 'tenant1',
  organizationId: 'org-1',
  channelId: 'org-1',
  channelType: 'organization' as const,
  entityType: 'attachment' as const,
  subjectId: 'subject-1',
  contextId: 'host-1',
};

describe('getNotificationRoute', () => {
  beforeEach(() => getProductDeepLink.mockReturnValue({}));

  it("opens the subject on the product's own param", () => {
    getProductDeepLink.mockReturnValue({ param: 'attachmentDialogId' });
    expect(getNotificationRoute(target)?.search).toEqual({ attachmentDialogId: 'subject-1' });
  });

  // A product rendered inside a host (a comment in its item): the host's param, at the context id.
  it('opens the host at the context id', () => {
    getProductDeepLink.mockReturnValue({ hostParam: 'itemId' });
    expect(getNotificationRoute(target)?.search).toEqual({ itemId: 'host-1' });
  });

  it('leaves the host out when the row has no context (inbox rows carry null)', () => {
    getProductDeepLink.mockReturnValue({ hostParam: 'itemId' });
    expect(getNotificationRoute({ ...target, contextId: null })?.search).toEqual({});
  });

  it('opens nothing for a product whose module declares no deep link', () => {
    expect(getNotificationRoute(target)?.search).toEqual({});
  });

  it('routes to the channel, and asks for no param, when the notification names no subject', () => {
    const route = getNotificationRoute({ ...target, entityType: undefined, subjectId: undefined });
    expect(route).toEqual({
      to: '/$tenantId/$organizationSlug/organization',
      params: { tenantId: 'tenant1', organizationSlug: 'org-1' },
      search: {},
    });
    expect(getProductDeepLink).not.toHaveBeenCalled();
  });
});
