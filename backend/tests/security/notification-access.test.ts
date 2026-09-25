import { and, eq, inArray } from 'drizzle-orm';
import { createAttachments, type GetNotificationsResponse, getNotifications } from 'sdk';
import { hierarchy } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { baseDb as db, getSeedDb } from '#/db/db';
import { mailer } from '#/lib/mailer';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { runDigest } from '#/modules/notification/digest/run-digest';
import { notificationPreferencesTable, notificationsTable } from '#/modules/notification/notification-db';
import { sendPendingInstantEmails } from '#/modules/notification/operations/send-instant-emails';
import { organizationsTable } from '#/modules/organization/organization-db';
import { defaultHeaders } from '../fixtures';
import { createAppClient } from '../test-client';
import { mockFetchRequest, setTestConfig } from '../test-utils';
import { clearSecurityTestData, createOrgUser, createTestTenant, type TestTenant } from './helpers';

vi.mock('#/lib/mailer', () => ({
  mailer: { prepareEmails: vi.fn().mockResolvedValue(undefined) },
}));

setTestConfig({ enabledAuthStrategies: ['passkey'] });

const memberRole = hierarchy.getLeastPrivilegedRole('organization');
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// Attachments sit under RLS: rename them on the admin connection.
const adminDb = getSeedDb();

/** Every recipient address the mocked mailer was handed, with the static props and recipient fields of its mail. */
const mailsTo = (email: string) =>
  vi
    .mocked(mailer.prepareEmails)
    .mock.calls.flatMap(([, statics, recipients]) =>
      recipients.filter((recipient) => recipient.email === email).map((recipient) => ({ statics, recipient })),
    );

/**
 * Notifications were fanned out to readers, but access changes afterwards: a member who leaves the organization must
 * not keep reading its current titles and channel names through the inbox, the digest or a mention mail, and a first
 * digest must not reach back through the whole inbox.
 */
describe('Notification access', async () => {
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
    const { data, response } = await call(getNotifications, {
      query: { limit: 30 },
      headers: { ...defaultHeaders, Cookie: as.sessionCookie },
    });
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
    mockFetchRequest();
    tenant = await createTestTenant(call, 'notification-access');
    leaver = await createOrgUser(call, tenant.tenantId, tenant.organization.id, 'notification-leaver', memberRole);
    stayer = await createOrgUser(call, tenant.tenantId, tenant.organization.id, 'notification-stayer', memberRole);

    const { response } = await call(createAttachments, {
      path: { tenantId: tenant.tenantId, organizationId: tenant.organization.id },
      body: Object.values(attachmentIds).map((id) => ({
        id,
        filename: 'notification-access.pdf',
        contentType: 'application/pdf',
        size: '1024',
        keys: { original: `${tenant.organization.id}/${tenant.user.id}/${id}.pdf` },
        stx: { mutationId: id, sourceId: 'notification-access', fieldTimestamps: {} },
      })),
      headers: { ...defaultHeaders, Cookie: tenant.sessionCookie },
    });
    expect(response.status).toBe(201);
    await adminDb.update(attachmentsTable).set({ name: 'Old item' }).where(eq(attachmentsTable.id, attachmentIds.old));
    await adminDb
      .update(attachmentsTable)
      .set({ name: 'Fresh item' })
      .where(eq(attachmentsTable.id, attachmentIds.fresh));

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
    await db
      .delete(membershipsTable)
      .where(and(eq(membershipsTable.userId, leaver.id), eq(membershipsTable.organizationId, tenant.organization.id)));
    await adminDb
      .update(attachmentsTable)
      .set({ name: 'Renamed secret plan' })
      .where(eq(attachmentsTable.id, attachmentIds.secret));
    await db
      .update(organizationsTable)
      .set({ name: 'Renamed organization' })
      .where(eq(organizationsTable.id, tenant.organization.id));
  });

  // Each test starts from unmailed, undigested rows and users who never had a digest.
  beforeEach(async () => {
    vi.mocked(mailer.prepareEmails).mockClear();
    const users = [leaver.id, stayer.id];
    await db
      .update(notificationsTable)
      .set({ emailedAt: null, digestedAt: null, readAt: null })
      .where(inArray(notificationsTable.userId, users));
    await db
      .update(notificationPreferencesTable)
      .set({ lastDigestAt: null })
      .where(inArray(notificationPreferencesTable.userId, users));
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
});
