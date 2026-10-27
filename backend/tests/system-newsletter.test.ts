import { eq } from 'drizzle-orm';
import { sendNewsletter } from 'sdk';
import { generateId } from 'shared/utils/entity-id';
import { afterEach, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { mockPastIsoDate } from '#/mocks';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { usersTable } from '#/modules/user/user-db';
import { adminRole, defaultHeaders } from './fixtures';
import { adminDb, createSystemAdminUser, createTestOrganization, createTestSession, createTestUser, mailsTo } from './helpers';
import { clearSecurityTestData } from './security/helpers';
import { createAppClient } from './test-client';

describe('System newsletter', async () => {
  const call = await createAppClient();

  afterEach(async () => await clearSecurityTestData());

  it('mails a member of two chosen organizations once', async () => {
    const admin = await createSystemAdminUser('newsletter-admin@example.test');
    const member = await createTestUser('newsletter-member@example.test');
    await adminDb.update(usersTable).set({ newsletter: true }).where(eq(usersTable.id, member.id));

    const organizations = [await createTestOrganization(), await createTestOrganization()];
    await db.insert(membershipsTable).values(
      organizations.map((organization) => ({
        id: generateId(),
        userId: member.id,
        channelId: organization.id,
        organizationId: organization.id,
        tenantId: organization.tenantId,
        channelType: 'organization' as const,
        role: adminRole,
        displayOrder: 1,
        createdAt: mockPastIsoDate(),
        createdBy: member.id,
      })),
    );

    const { response } = await call(sendNewsletter, {
      query: { toSelf: false },
      body: { organizationIds: organizations.map((organization) => organization.id), roles: [adminRole], subject: 'News', content: '<p>News</p>' },
      headers: { ...defaultHeaders, Cookie: await createTestSession(admin) },
    });
    expect(response.status).toBe(204);
    expect(mailsTo(member.email)).toHaveLength(1);
  });
});
