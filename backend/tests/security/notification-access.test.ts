import { and, eq, inArray } from 'drizzle-orm';
import { createAttachments, type GetNotificationsResponse, getNotifications } from 'sdk';
import { generateId } from 'shared/utils/entity-id';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { runDigest } from '#/modules/notification/digest/run-digest';
import { notificationPreferencesTable, notificationsTable } from '#/modules/notification/notification-db';
import { sendPendingInstantEmails } from '#/modules/notification/operations/send-instant-emails';
import { organizationsTable } from '#/modules/organization/organization-db';
import { defaultHeaders, memberRole } from '../fixtures';
import { adminDb, mailsTo } from '../helpers';
import { attachmentBody, seedAttachmentHome } from '../hierarchy-helpers';
import { createAppClient } from '../test-client';
import { setTestConfig } from '../test-utils';
import { assumeMemberAttachmentPolicy, clearSecurityTestData, createOrgUser, createTestTenant, type TestTenant } from './helpers';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/**
 * Notifications were fanned out to readers, but access changes afterwards: a member who leaves the organization, or
 * stays but may no longer read an item, must not keep reading its current title and channel name through the inbox,
 * the digest or a mention mail, and a first digest must not reach back through the whole inbox.
 */
describe('Notification access', async () => {
  assumeMemberAttachmentPolicy({ read: 1, update: 'own', delete: 'own' });
  const call = await createAppClient();
  let tenant: TestTenant;
  let leaver: { id: string; email: string; sessionCookie: string };
  let stayer: { id: string; email: string; sessionCookie: string };
  const attachmentIds = { secret: generateId(), old: generateId(), fresh: generateId() };

  const insertNotification = async (userId: string, subjectId: string, createdAt: Date) => {
    const [row] = await db
      .insert(notificationsTable)
      .values({
        createdAt: createdAt.toISOString(),
        userId,
        actorId: tenant.user.id,
        type: 'mention',
        entityType: 'attachment',
        subjectId,
        contextId: subjectId,
        channelId: tenant.organization.id,
        channelType: 'organization',
        organizationId: tenant.organization.id,
        tenantId: tenant.tenantId,
        activityId: `act:${generateId()}`,
      })
      .returning();
    return row;
  };

  const inbox = async (as: { sessionCookie: string }) => {
    const { data, response } = await call(getNotifications, { query: { limit: 30 }, headers: { ...defaultHeaders, Cookie: as.sessionCookie } });
    expect(response.status).toBe(200);
    return data as GetNotificationsResponse;
  };

  /** A digest run at noon today, local time, so the send hour has passed whenever the suite runs. */
  const noon = () => {
    const now = new Date();
    now.setHours(12, 0, 0, 0);
    return now;
  };

  beforeAll(async () => {
    tenant = await createTestTenant(call, 'notification-access');
    leaver = await createOrgUser(call, tenant.tenantId, tenant.organization.id, 'notification-leaver', memberRole);
    stayer = await createOrgUser(call, tenant.tenantId, tenant.organization.id, 'notification-stayer', memberRole);

    const home = await seedAttachmentHome({ id: tenant.organization.id, tenantId: tenant.tenantId }, tenant.user.id);
    const { response } = await call(createAttachments, {
      path: { tenantId: tenant.tenantId, organizationId: tenant.organization.id },
      body: Object.values(attachmentIds).map((id) => attachmentBody(id, home)),
      headers: { ...defaultHeaders, Cookie: tenant.sessionCookie },
    });
    expect(response.status).toBe(201);
    await adminDb.update(attachmentsTable).set({ name: 'Old item' }).where(eq(attachmentsTable.id, attachmentIds.old));
    await adminDb.update(attachmentsTable).set({ name: 'Fresh item' }).where(eq(attachmentsTable.id, attachmentIds.fresh));

    const now = noon();
    // The leaver was told about an item while a member; a daily digest and mention mails are on for both users.
    await insertNotification(leaver.id, attachmentIds.secret, new Date(now.getTime() - HOUR));
    await insertNotification(stayer.id, attachmentIds.old, new Date(now.getTime() - 30 * DAY));
    await insertNotification(stayer.id, attachmentIds.fresh, new Date(now.getTime() - HOUR));
    await db.insert(notificationPreferencesTable).values([
      { userId: leaver.id, digest: 'daily' },
      { userId: stayer.id, digest: 'daily' },
    ]);

    // The leaver leaves; afterwards the item and the organization are renamed.
    await db.delete(membershipsTable).where(and(eq(membershipsTable.userId, leaver.id), eq(membershipsTable.organizationId, tenant.organization.id)));
    await adminDb.update(attachmentsTable).set({ name: 'Renamed secret plan' }).where(eq(attachmentsTable.id, attachmentIds.secret));
    await db.update(organizationsTable).set({ name: 'Renamed organization' }).where(eq(organizationsTable.id, tenant.organization.id));
  });

  // Each test starts from unmailed, undigested rows and users who never had a digest.
  beforeEach(async () => {
    const users = [leaver.id, stayer.id];
    await db.update(notificationsTable).set({ emailedAt: null, digestedAt: null, readAt: null }).where(inArray(notificationsTable.userId, users));
    await db.update(notificationPreferencesTable).set({ lastDigestAt: null }).where(inArray(notificationPreferencesTable.userId, users));
  });

  afterAll(async () => {
    await db.delete(notificationsTable).where(inArray(notificationsTable.userId, [leaver.id, stayer.id]));
    await clearSecurityTestData();
  });

  it("must not show a left organization's notifications via getNotifications", async () => {
    const { items, unreadCount } = await inbox(leaver);
    expect(items).toEqual([]);
    expect(unreadCount).toBe(0);
    expect(JSON.stringify(items)).not.toContain('Renamed');
  });

  it('lists a current member their notifications with names (positive control)', async () => {
    const { items, unreadCount } = await inbox(stayer);
    expect(unreadCount).toBe(2);
    const fresh = items.find((item) => item.subjectId === attachmentIds.fresh);
    expect(fresh).toMatchObject({ subjectTitle: 'Fresh item', channelName: 'Renamed organization' });
  });

  it("must not mail a left organization's mention via the instant email", async () => {
    await sendPendingInstantEmails(tenant.organization.id);
    expect(mailsTo(leaver.email)).toEqual([]);
    // A current member's pending mention goes out (positive control).
    expect(mailsTo(stayer.email).map(({ recipient }) => 'subjectTitle' in recipient && recipient.subjectTitle)).toEqual(
      expect.arrayContaining(['Fresh item']),
    );
  });

  it("must not mail a left organization's items, nor reach past the first window, via the digest", async () => {
    await runDigest(noon());

    expect(mailsTo(leaver.email)).toEqual([]);

    // The stayer's first digest covers the fresh mention only, not the month-old one.
    const [digest] = mailsTo(stayer.email);
    const sectionsHtml = digest && 'sectionsHtml' in digest.recipient ? String(digest.recipient.sectionsHtml) : '';
    expect(sectionsHtml).toContain('Fresh item');
    expect(sectionsHtml).not.toContain('Old item');
  });

  describe('with a member role that reads only its own attachments', () => {
    // An app configuration the engine supports: `read: 'own'` hides the admin's items from the stayer, who stays in
    // the organization, as leaving a channel below it does in an app that has them.
    assumeMemberAttachmentPolicy({ read: 'own' });

    it('must not name an item the member may no longer read via the inbox, the mention mail or the digest', async () => {
      // The stayer still belongs, so the rows stay, but none names its item or channel.
      const { items, unreadCount } = await inbox(stayer);
      expect(unreadCount).toBe(2);
      for (const item of items) expect(item).toMatchObject({ subjectTitle: '', channelName: '' });

      await sendPendingInstantEmails(tenant.organization.id);
      expect(mailsTo(stayer.email)).toEqual([]);

      await runDigest(noon());
      expect(mailsTo(stayer.email)).toEqual([]);
    });
  });
});
