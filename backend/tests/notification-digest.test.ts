import { eq } from 'drizzle-orm';
import { createAttachments } from 'sdk';
import { generateId } from 'shared/utils/entity-id';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { notificationPreferencesTable, notificationsTable } from '#/modules/notification/notification-db';
import { runDigest } from '#/modules/notification/operations/run-digest';
import { adminRole, defaultHeaders } from './fixtures';
import { adminDb, mailsTo } from './helpers';
import { attachmentBody, seedAttachmentHome } from './hierarchy-helpers';
import { clearSecurityTestData, createOrgUser, createTestTenant, type TestTenant } from './security/helpers';
import { createAppClient } from './test-client';
import { setTestConfig } from './test-utils';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

/** Noon, local time, on the next `isoWeekday` (1 = Monday … 7 = Sunday) after today: past the send hour. */
const nextNoonOn = (isoWeekday: number) => {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  do date.setDate(date.getDate() + 1);
  while ((date.getDay() || 7) !== isoWeekday);
  return date;
};

// The weekly digest is the default cadence: an account that never opened its notification settings has no
// preferences row and still gets it.
describe('Weekly digest by default', async () => {
  const call = await createAppClient();
  let tenant: TestTenant;
  let member: { id: string; email: string };
  /** A member with nothing to digest: the run never walks it. */
  let idle: { id: string; email: string };
  const attachmentId = generateId();

  const preferencesOf = async (userId: string) =>
    (await db.select().from(notificationPreferencesTable).where(eq(notificationPreferencesTable.userId, userId)))[0];

  beforeAll(async () => {
    tenant = await createTestTenant(call, 'digest-default');
    member = await createOrgUser(call, tenant.tenantId, tenant.organization.id, 'digest-default-member', adminRole);
    idle = await createOrgUser(call, tenant.tenantId, tenant.organization.id, 'digest-default-idle', adminRole);

    const home = await seedAttachmentHome({ id: tenant.organization.id, tenantId: tenant.tenantId }, tenant.user.id);
    const { response } = await call(createAttachments, {
      path: { tenantId: tenant.tenantId, organizationId: tenant.organization.id },
      body: [attachmentBody(attachmentId, home)],
      headers: { ...defaultHeaders, Cookie: tenant.sessionCookie },
    });
    expect(response.status).toBe(201);
    await adminDb.update(attachmentsTable).set({ name: 'Weekly item' }).where(eq(attachmentsTable.id, attachmentId));

    // Undigested and never mailed instantly, an hour old.
    await db.insert(notificationsTable).values({
      createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      userId: member.id,
      actorId: tenant.user.id,
      type: 'comment',
      entityType: 'attachment',
      subjectId: attachmentId,
      contextId: attachmentId,
      channelId: tenant.organization.id,
      channelType: 'organization',
      organizationId: tenant.organization.id,
      tenantId: tenant.tenantId,
      activityId: `act:${generateId()}`,
    });
  });

  afterAll(async () => {
    await db.delete(notificationsTable).where(eq(notificationsTable.userId, member.id));
    await clearSecurityTestData();
  });

  it('skips a user without a preferences row on a weekday that is not the weekly one', async () => {
    expect(await preferencesOf(member.id)).toBeUndefined();
    await runDigest(nextNoonOn(4));
    expect(mailsTo(member.email)).toEqual([]);
  });

  it('mails the weekly digest to a user without a preferences row and stamps the run on a new row', async () => {
    expect(await preferencesOf(member.id)).toBeUndefined();
    const friday = nextNoonOn(5);
    await runDigest(friday);

    const [digest] = mailsTo(member.email);
    const sectionsHtml = digest && 'sectionsHtml' in digest.recipient ? String(digest.recipient.sectionsHtml) : '';
    expect(sectionsHtml).toContain('Weekly item');
    const preferences = await preferencesOf(member.id);
    expect(preferences?.digest).toBe('weekly');
    expect(preferences?.lastDigestAt).not.toBeNull();

    // A user with nothing undigested is not due, so the run neither mails nor stamps it.
    expect(mailsTo(idle.email)).toEqual([]);
    expect(await preferencesOf(idle.id)).toBeUndefined();
  });
});
