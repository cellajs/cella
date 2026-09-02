import { hierarchy } from 'shared';
import { describe, expect, it } from 'vitest';
import { activityListQuerySchema } from '#/modules/activities/activities-schema';
import { memberListQuerySchema } from '#/modules/memberships/memberships-schema';
import { sendNewsletterBodySchema } from '#/modules/system/system-schema';

/** The root vocabulary's floor role: `member` in cella; apps with other vocabularies still run this file unchanged. */
const memberRole = hierarchy.getLeastPrivilegedRole(hierarchy.rootChannelType);

const firstId = '00000000-0000-4000-8000-000000000001';
const secondId = '00000000-0000-4000-8000-000000000002';

describe('activityListQuerySchema', () => {
  it('allows an unfiltered activity list request', () => {
    expect(activityListQuerySchema.safeParse({}).success).toBe(true);
  });
});

describe('memberListQuerySchema', () => {
  const baseQuery = { entityId: firstId, entityType: 'organization' as const };

  it('parses a bounded comma-separated UUID list once at the request boundary', () => {
    expect(memberListQuerySchema.parse({ ...baseQuery, userIds: `${firstId}, ${secondId}` }).userIds).toEqual([
      firstId,
      secondId,
    ]);
  });

  it.each(['', 'not-an-id', `${firstId},`, Array.from({ length: 51 }, () => firstId).join(',')])(
    'rejects invalid member ID list %s',
    (userIds) => {
      expect(memberListQuerySchema.safeParse({ ...baseQuery, userIds }).success).toBe(false);
    },
  );
});

describe('sendNewsletterBodySchema', () => {
  const baseBody = { organizationIds: [firstId], roles: [memberRole] as const, subject: 'Subject', content: 'Content' };

  it('keeps an empty organization scope available for toSelf previews', () => {
    expect(sendNewsletterBodySchema.safeParse({ ...baseBody, organizationIds: [] }).success).toBe(true);
  });

  it.each([
    { ...baseBody, organizationIds: ['not-an-id'] },
    { ...baseBody, organizationIds: [firstId, firstId] },
    { ...baseBody, roles: [memberRole, memberRole] },
  ])('rejects invalid or duplicate targeting values %#', (body) => {
    expect(sendNewsletterBodySchema.safeParse(body).success).toBe(false);
  });
});
