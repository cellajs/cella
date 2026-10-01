import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getNotificationRoute } from '~/modules/notification/notification-link';

const { notificationSearch } = vi.hoisted(() => ({
  notificationSearch: vi.fn((_notification: Record<string, unknown>): Record<string, string> => ({})),
}));

// A channel whose notification search opens a comment's host item, the way an app with threads declares it.
vi.mock('~/routes-config', () => ({
  channelRouteConfig: { organization: { path: '/$tenantId/$organizationSlug/organization', paramName: 'organizationSlug', notificationSearch } },
}));

const target = {
  tenantId: 'tenant1',
  organizationId: 'org-1',
  channelId: 'org-1',
  channelType: 'organization' as const,
  entityType: 'attachment' as const,
  subjectId: 'comment-1',
};

describe('getNotificationRoute', () => {
  beforeEach(() => notificationSearch.mockClear());

  it("hands the channel's notification search the context id", () => {
    getNotificationRoute({ ...target, contextId: 'post-1' });
    expect(notificationSearch).toHaveBeenCalledWith({ entityType: 'attachment', subjectId: 'comment-1', contextId: 'post-1' });
  });

  it('hands null when the row has no context (inbox rows carry null)', () => {
    getNotificationRoute({ ...target, contextId: null });
    expect(notificationSearch).toHaveBeenCalledWith({ entityType: 'attachment', subjectId: 'comment-1', contextId: null });
  });
});
