import { and, eq, inArray } from 'drizzle-orm';
import { type GetNotificationsResponse, getNotifications, updateAttachment } from 'sdk';
import { appConfig } from 'shared';
import type { TestEntityHierarchyPlan } from 'shared/testing/entity-hierarchy';
import { generateId } from 'shared/utils/entity-id';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { generateServerHLC } from '#/core/stx';
import { getSeedDb } from '#/db/db';
import type { ActivityEvent } from '#/lib/activity-bus';
import { buildInsertableProduct } from '#/mocks';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { notificationsTable } from '#/modules/notification/notification-db';
import { fanOutNotifications } from '#/modules/notification/operations/fan-out';
import { sendPendingInstantEmails } from '#/modules/notification/operations/send-instant-emails';
import { sendNotificationPush } from '#/modules/push/push-sender';
import { emailsTable } from '#/modules/user/emails-db';
import { materializeDescriptionOp } from '#/modules/yjs/operations/materialize-description';
import { mockStxBase } from '#/schemas/sync-transaction-mocks';
import { adminRole, defaultHeaders, memberRole } from './fixtures';
import { createOrganizationAdminUser, createTestUser, mailsTo } from './helpers';
import { cleanupEntityHierarchy, insertAttachmentRow, seedAttachmentHome } from './hierarchy-helpers';
import { clearSecurityTestData, createOrgUser, createTestTenant, type TestTenant } from './security/helpers';
import { createAppClient } from './test-client';
import { setTestConfig } from './test-utils';

// Direct table seeding and inspection run as admin: attachments are RLS-subject and the runtime role sees them only inside a tenant transaction.
const db = getSeedDb();

setTestConfig({ enabledAuthStrategies: ['passkey'] });

// Push sending is on and records its payloads; nothing reaches a push service.
vi.mock('#/modules/push/push-sender', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#/modules/push/push-sender')>()),
  isPushSendConfigured: () => true,
  sendNotificationPush: vi.fn(async () => undefined),
}));

/** The context id a notification link carries, as the `/n` route reads it. */
const linkedContextId = (link: unknown) => new URL(String(link)).searchParams.get('contextId');

const attachmentId = generateId();

const paragraphWithMentions = (ids: string[]) => ({
  id: generateId(),
  type: 'paragraph',
  props: {},
  content: ids.map((id) => ({ type: 'mention', props: { id, name: 'someone', slug: 'someone' } })),
  children: [],
});

const paragraphWithText = (text: string) => ({
  id: generateId(),
  type: 'paragraph',
  props: {},
  content: [{ type: 'text', text, styles: {} }],
  children: [],
});

const updateStx = () => ({
  ...mockStxBase(`stx:${generateId()}`),
  fieldTimestamps: { description: generateServerHLC('test-client') },
});

const nullAncestorScopes = Object.fromEntries(
  appConfig.channelEntityTypes
    .filter((channelType) => channelType !== 'organization')
    .map((channelType) => [appConfig.entityIdColumnKeys[channelType], null]),
);

// Covers the attachment notification source, the template consumer of the notifications contract:
// `mentions` is derived server-side from the description on client writes and on Yjs
// materialization, keeps only users who may read the row, fans out to the inbox and mails.
describe('Attachment mentions (template notification source)', async () => {
  const call = await createAppClient();
  let tenant: TestTenant;
  let member: { id: string; email: string; sessionCookie: string };
  /** An account with no membership in the organization: a mention of it names someone who may not read the row. */
  let stranger: { id: string };
  let plan: TestEntityHierarchyPlan;

  const putDescription = async (description: string) =>
    call(updateAttachment, {
      path: { organizationId: tenant.organization.id, tenantId: tenant.tenantId, id: attachmentId },
      body: { ops: { description }, stx: updateStx() },
      headers: { ...defaultHeaders, Cookie: tenant.sessionCookie },
    });

  const storedMentions = async () => {
    const [row] = await db
      .select({ mentions: attachmentsTable.mentions })
      .from(attachmentsTable)
      .where(eq(attachmentsTable.id, attachmentId));
    return row.mentions;
  };

  const storedKeywords = async () => {
    const [row] = await db
      .select({ keywords: attachmentsTable.keywords })
      .from(attachmentsTable)
      .where(eq(attachmentsTable.id, attachmentId));
    return row.keywords;
  };

  const notificationsFor = (userId: string) =>
    db
      .select({ type: notificationsTable.type, emailedAt: notificationsTable.emailedAt })
      .from(notificationsTable)
      .where(and(eq(notificationsTable.userId, userId), eq(notificationsTable.subjectId, attachmentId)));

  const updatedEvent = (actorId: string): ActivityEvent =>
    // Test mock: the CDC worker fills the remaining columns; the fan-out reads only these.
    ({
      id: `act:${generateId()}`,
      type: 'attachment.updated',
      action: 'update',
      entityType: 'attachment',
      resourceType: null,
      tableName: 'attachments',
      subjectId: attachmentId,
      userId: actorId,
      tenantId: tenant.tenantId,
      organizationId: tenant.organization.id,
      ...nullAncestorScopes,
      rowData: null,
      seq: null,
      batchUntilSeq: null,
      count: null,
      propagation: null,
      trace: null,
      stx: null,
      changedFields: ['description'],
    }) as unknown as ActivityEvent;

  beforeAll(async () => {
    tenant = await createTestTenant(call, 'attachment-mentions');
    // The role that reads every attachment under any app's permission matrix; the stranger covers the drop path.
    member = await createOrgUser(
      call,
      tenant.tenantId,
      tenant.organization.id,
      'attachment-mentions-member',
      adminRole,
    );
    stranger = await createTestUser('attachment-mentions-stranger@security-test.com');

    plan = await seedAttachmentHome({ id: tenant.organization.id, tenantId: tenant.tenantId }, tenant.user.id);

    const row = buildInsertableProduct(
      'attachment',
      {
        id: attachmentId,
        tenantId: tenant.tenantId,
        ...plan.channelIdColumns,
        createdBy: tenant.user.id,
        updatedBy: null,
        deletedBy: null,
      },
      attachmentId,
    );
    await insertAttachmentRow(row);
  });

  afterAll(async () => {
    await db.delete(notificationsTable).where(inArray(notificationsTable.subjectId, [attachmentId]));
    await db.delete(attachmentsTable).where(eq(attachmentsTable.id, attachmentId));
    await cleanupEntityHierarchy(db, plan);
    await clearSecurityTestData();
  });

  it('stores readable mentioned users and drops an account without read access', async () => {
    const result = await putDescription(JSON.stringify([paragraphWithMentions([member.id, stranger.id])]));
    expect(result.response.status).toBe(200);
    expect(await storedMentions()).toEqual([member.id]);
  });

  it('clears mentions once the description no longer carries them', async () => {
    const result = await putDescription(JSON.stringify([paragraphWithMentions([])]));
    expect(result.response.status).toBe(200);
    expect(await storedMentions()).toEqual([]);
  });

  it('re-derives the keywords search column from the description on both write paths', async () => {
    const result = await putDescription(
      JSON.stringify([paragraphWithText('quarterly budget'), paragraphWithMentions([member.id])]),
    );
    expect(result.response.status).toBe(200);
    expect(await storedKeywords()).toContain('quarterly budget');

    await materializeDescriptionOp({
      entityType: 'attachment',
      entityId: attachmentId,
      tenantId: tenant.tenantId,
      organizationId: tenant.organization.id,
      description: JSON.stringify([paragraphWithText('signed contract')]),
      editors: [tenant.user.id],
    });
    const keywords = await storedKeywords();
    expect(keywords).toContain('signed contract');
    expect(keywords).not.toContain('quarterly budget');
  });

  it('derives from Yjs materialization too, the write path of the collaborative editor', async () => {
    await materializeDescriptionOp({
      entityType: 'attachment',
      entityId: attachmentId,
      tenantId: tenant.tenantId,
      organizationId: tenant.organization.id,
      description: JSON.stringify([paragraphWithMentions([member.id])]),
      editors: [tenant.user.id],
    });
    expect(await storedMentions()).toEqual([member.id]);
  });

  it('fans out a mention to the inbox and mails it instantly, never to the actor', async () => {
    // The fan-out reports whether it wrote a mention; only then does the listener run the instant email pass.
    expect(await fanOutNotifications(updatedEvent(member.id))).toBe(false);
    expect(await notificationsFor(member.id)).toEqual([]);

    expect(await fanOutNotifications(updatedEvent(tenant.user.id))).toBe(true);
    expect(await notificationsFor(member.id)).toEqual([{ type: 'mention', emailedAt: null }]);
    // The push link opens the notification's context, which defaults to the row itself.
    const [, payload] = vi.mocked(sendNotificationPush).mock.calls.at(-1) ?? [];
    expect(linkedContextId(payload?.url)).toBe(attachmentId);

    // A later edit that adds no mention writes nothing.
    expect(await fanOutNotifications(updatedEvent(tenant.user.id))).toBe(false);

    // Mention email is on by default; the member's address is verified.
    await sendPendingInstantEmails(tenant.organization.id);
    expect((await notificationsFor(member.id))[0]?.emailedAt).not.toBeNull();
  });

  it('links the mention mail to the notification context, the item hosting the subject', async () => {
    const hostId = generateId();
    await db.insert(notificationsTable).values({
      userId: member.id,
      actorId: tenant.user.id,
      type: 'mention',
      entityType: 'attachment',
      subjectId: attachmentId,
      contextId: hostId,
      channelId: tenant.organization.id,
      channelType: 'organization',
      organizationId: tenant.organization.id,
      tenantId: tenant.tenantId,
      activityId: `act:${generateId()}`,
    });

    await sendPendingInstantEmails(tenant.organization.id);
    const [mail] = mailsTo(member.email);
    expect(linkedContextId(mail?.recipient.link)).toBe(hostId);
  });

  it('lists the inbox row with the actor, channel and subject the card sentence needs', async () => {
    const result = await call(getNotifications, {
      query: { limit: 10 },
      headers: { ...defaultHeaders, Cookie: member.sessionCookie },
    });
    expect(result.response.status).toBe(200);
    // The test client types the body loosely; the SDK response type names the fields under test.
    const [row] = (result.data as GetNotificationsResponse | undefined)?.items ?? [];
    expect(row).toMatchObject({ type: 'mention', subjectId: attachmentId, entityType: 'attachment' });
    expect(row?.actor?.id).toBe(tenant.user.id);
    expect(row?.channelName).not.toBe('');
    expect(row?.subjectTitle).not.toBe('');
  });

  it('mails a newer mention behind a backlog of unmailable rows larger than one pass', async () => {
    // A member without a verified address is never mailed; one pass handles 200 rows.
    const unverified = await createOrganizationAdminUser(
      'attachment-mentions-unverified@security-test.com',
      tenant.organization.id,
      memberRole,
      tenant.tenantId,
    );
    await getSeedDb().delete(emailsTable).where(eq(emailsTable.userId, unverified.id));
    const mentionOf = (userId: string, createdAt: Date) => ({
      createdAt: createdAt.toISOString(),
      userId,
      actorId: tenant.user.id,
      type: 'mention' as const,
      entityType: 'attachment' as const,
      subjectId: attachmentId,
      contextId: attachmentId,
      channelId: tenant.organization.id,
      channelType: 'organization' as const,
      organizationId: tenant.organization.id,
      tenantId: tenant.tenantId,
      activityId: `act:${generateId()}`,
    });
    const anHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    await db.insert(notificationsTable).values(Array.from({ length: 201 }, () => mentionOf(unverified.id, anHourAgo)));
    const [fresh] = await db
      .insert(notificationsTable)
      .values(mentionOf(member.id, new Date()))
      .returning({ id: notificationsTable.id });

    await sendPendingInstantEmails(tenant.organization.id);
    await sendPendingInstantEmails(tenant.organization.id);

    const emailedAt = async (id: string) =>
      (
        await db
          .select({ emailedAt: notificationsTable.emailedAt })
          .from(notificationsTable)
          .where(eq(notificationsTable.id, id))
      )[0]?.emailedAt;
    expect(await emailedAt(fresh.id)).not.toBeNull();
    // The unmailable rows are settled too, so no later pass reads them again.
    const backlog = await db
      .select({ emailedAt: notificationsTable.emailedAt })
      .from(notificationsTable)
      .where(eq(notificationsTable.userId, unverified.id));
    expect(backlog.filter(({ emailedAt }) => emailedAt === null)).toHaveLength(0);
  });
});
