import { describe, expect, it } from 'vitest';
import { buildNotificationLink, type NotificationLinkSearch, notificationLinkSearchSchema } from './notification-link.ts';

const frontendUrl = 'https://app.example.test';

const search: NotificationLinkSearch = {
  tenantId: 'tenant1',
  organizationId: 'org-1',
  channelId: 'org-1',
  channelType: 'organization',
  entityType: 'attachment',
  subjectId: 'comment-1',
  contextId: 'post-1',
  nid: 'notification-1',
};

/** What the `/n` route reads back from the link. */
const parse = (link: string) => notificationLinkSearchSchema.parse(Object.fromEntries(new URL(link).searchParams.entries()));

describe('buildNotificationLink', () => {
  it('carries every search field through the link, the context id included', () => {
    const link = buildNotificationLink(frontendUrl, search);
    expect(link.startsWith(`${frontendUrl}/n?`)).toBe(true);
    expect(parse(link)).toEqual(search);
  });

  it('leaves out the optional fields a notification lacks', () => {
    const { entityType: _entityType, subjectId: _subjectId, contextId: _contextId, nid: _nid, ...location } = search;
    const link = buildNotificationLink(frontendUrl, location);
    expect(new URL(link).searchParams.has('contextId')).toBe(false);
    expect(parse(link)).toEqual(location);
  });
});
