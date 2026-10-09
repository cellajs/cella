import { and, eq, inArray } from 'drizzle-orm';
import { type GetNotificationsResponse, getNotifications, updateAttachment } from 'sdk';
import { appConfig } from 'shared';
import type { TestEntityHierarchyPlan } from 'shared/testing/entity-hierarchy';
import { generateId } from 'shared/utils/entity-id';
import { afterAll, beforeAll, describe, expect, it, onTestFinished, vi } from 'vitest';
import { generateServerHLC } from '#/core/stx';
import { baseDb, getSeedDb } from '#/db/db';
import type { ActivityEvent } from '#/lib/activity-bus';
import { buildInsertableProduct } from '#/mocks';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { commentEmail } from '#/modules/notification/emails/comment-email';
import { mentionEmail } from '#/modules/notification/emails/mention-email';
import { notificationPreferencesTable, notificationsTable } from '#/modules/notification/notification-db';
import { getNotificationSource } from '#/modules/notification/notification-sources';
import { fanOutNotifications } from '#/modules/notification/operations/fan-out';
import { sendPendingInstantEmails } from '#/modules/notification/operations/send-instant-emails';
import { sendNotificationPush } from '#/modules/push/push-sender';
import { emailsTable } from '#/modules/user/emails-db';
import { materializeDescriptionOp } from '#/modules/yjs/operations/materialize-description';
import { mockStxBase } from '#/schemas/sync-transaction-mocks';
import { adminRole, defaultHeaders, memberRole, overrideConfig } from './fixtures';
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

/** A stored body whose one paragraph mentions the given users. */
const mentionsOf = (ids: string[]) => JSON.stringify([paragraphWithMentions(ids)]);

const paragraphWithText = (text: string) => ({
  id: generateId(),
  type: 'paragraph',
  props: {},
  content: [{ type: 'text', text, styles: {} }],
  children: [],
});

const updateStx = () => ({ ...mockStxBase(`stx:${generateId()}`), fieldTimestamps: { description: generateServerHLC('test-client') } });

const nullAncestorScopes = Object.fromEntries(
  appConfig.channelEntityTypes
    .filter((channelType) => channelType !== 'organization')
    .map((channelType) => [appConfig.entityIdColumnKeys[channelType], null]),
);

// Covers the attachment notification source, the template consumer of the notifications contract:
// the fan-out reads mentions from the stored description of a created row or a changed body,
// keeps only users who may read the row, writes the inbox and mails.
describe('Attachment mentions (template notification source)', async () => {
  const call = await createAppClient();
  let tenant: TestTenant;
  let member: { id: string; email: string; sessionCookie: string };
  /** An account with no membership in the organization: a mention of it names someone who may not read the row. */
  let stranger: { id: string };
  let plan: TestEntityHierarchyPlan;

  const putDescription = async (description: string, id = attachmentId) =>
    call(updateAttachment, {
      path: { organizationId: tenant.organization.id, tenantId: tenant.tenantId, id },
      body: { ops: { description }, stx: updateStx() },
      headers: { ...defaultHeaders, Cookie: tenant.sessionCookie },
    });

  const storedKeywords = async () => {
    const [row] = await db.select({ keywords: attachmentsTable.keywords }).from(attachmentsTable).where(eq(attachmentsTable.id, attachmentId));
    return row.keywords;
  };

  const notificationsFor = (userId: string) =>
    db
      .select({ type: notificationsTable.type, emailedAt: notificationsTable.emailedAt })
      .from(notificationsTable)
      .where(and(eq(notificationsTable.userId, userId), eq(notificationsTable.subjectId, attachmentId)));

  /** An update of one attachment as the bus delivers it; `subjectIds` makes it an event of several rows. */
  const updatedEvent = (actorId: string, overrides: Partial<ActivityEvent> = {}, subjectIds = [overrides.subjectId ?? attachmentId]): ActivityEvent =>
    // Test mock: the CDC worker fills the remaining columns; the fan-out reads only these.
    ({
      id: `act:${generateId()}`,
      type: 'attachment.updated',
      action: 'update',
      entityType: 'attachment',
      resourceType: null,
      tableName: 'attachments',
      userId: actorId,
      tenantId: tenant.tenantId,
      organizationId: tenant.organization.id,
      ...nullAncestorScopes,
      rowData: null,
      trace: null,
      stx: null,
      changedFields: ['description'],
      ...overrides,
      // The activity is that of the first row.
      subjectId: subjectIds[0],
      rows: subjectIds.map((id) => ({ rowData: { id } })),
    }) as unknown as ActivityEvent;

  beforeAll(async () => {
    tenant = await createTestTenant(call, 'attachment-mentions');
    // The role that reads every attachment under any app's permission matrix; the stranger covers the drop path.
    member = await createOrgUser(call, tenant.tenantId, tenant.organization.id, 'attachment-mentions-member', adminRole);
    stranger = await createTestUser('attachment-mentions-stranger@security-test.com');

    plan = await seedAttachmentHome({ id: tenant.organization.id, tenantId: tenant.tenantId }, tenant.user.id);

    const row = buildInsertableProduct(
      'attachment',
      { id: attachmentId, tenantId: tenant.tenantId, ...plan.channelIdColumns, createdBy: tenant.user.id, updatedBy: null, deletedBy: null },
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

  it('re-derives the keywords search column from the description on both write paths', async () => {
    const result = await putDescription(JSON.stringify([paragraphWithText('quarterly budget'), paragraphWithMentions([member.id])]));
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

  it('fans out a mention a Yjs materialization wrote to the inbox and mails it instantly, never to the actor', async () => {
    await materializeDescriptionOp({
      entityType: 'attachment',
      entityId: attachmentId,
      tenantId: tenant.tenantId,
      organizationId: tenant.organization.id,
      description: mentionsOf([member.id]),
      editors: [tenant.user.id],
    });

    // The fan-out reports whether it wrote a row the instant pass mails; only then does the listener run the pass.
    expect(await fanOutNotifications(updatedEvent(member.id))).toBe(false);
    expect(await notificationsFor(member.id)).toEqual([]);

    expect(await fanOutNotifications(updatedEvent(tenant.user.id))).toBe(true);
    expect(await notificationsFor(member.id)).toEqual([{ type: 'mention', emailedAt: null }]);
    // The push link opens the notification's context, which defaults to the row itself.
    const [, payload] = vi.mocked(sendNotificationPush).mock.calls.at(-1) ?? [];
    expect(linkedContextId(payload?.url)).toBe(attachmentId);

    // A later edit of the same body tells nobody twice.
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
    const result = await call(getNotifications, { query: { limit: 10 }, headers: { ...defaultHeaders, Cookie: member.sessionCookie } });
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
    const [fresh] = await db.insert(notificationsTable).values(mentionOf(member.id, new Date())).returning({ id: notificationsTable.id });

    await sendPendingInstantEmails(tenant.organization.id);
    await sendPendingInstantEmails(tenant.organization.id);

    const emailedAt = async (id: string) =>
      (await db.select({ emailedAt: notificationsTable.emailedAt }).from(notificationsTable).where(eq(notificationsTable.id, id)))[0]?.emailedAt;
    expect(await emailedAt(fresh.id)).not.toBeNull();
    // The unmailable rows are settled too, so no later pass reads them again.
    const backlog = await db
      .select({ emailedAt: notificationsTable.emailedAt })
      .from(notificationsTable)
      .where(eq(notificationsTable.userId, unverified.id));
    expect(backlog.filter(({ emailedAt }) => emailedAt === null)).toHaveLength(0);
  });

  // Each test edits a subject of its own, so one test's inbox rows never dedupe another's.
  describe('mentions read from the stored body', () => {
    /** A second readable member, mentioned next to `member`. */
    let other: { id: string };
    const subjectIds: string[] = [];

    const newSubject = async (description: string | null = null) => {
      const id = generateId();
      subjectIds.push(id);
      const row = buildInsertableProduct(
        'attachment',
        { id, tenantId: tenant.tenantId, ...plan.channelIdColumns, description, createdBy: tenant.user.id, updatedBy: null, deletedBy: null },
        id,
      );
      await insertAttachmentRow(row);
      return id;
    };

    const inboxOf = (userId: string, subjectId: string) =>
      db
        .select({ type: notificationsTable.type })
        .from(notificationsTable)
        .where(and(eq(notificationsTable.userId, userId), eq(notificationsTable.subjectId, subjectId)));

    const createdEvent = (subjectId: string) =>
      updatedEvent(tenant.user.id, { subjectId, type: 'attachment.created', action: 'create', changedFields: null });

    beforeAll(async () => {
      other = await createOrgUser(call, tenant.tenantId, tenant.organization.id, 'attachment-mentions-other', adminRole);
    });

    afterAll(async () => {
      if (!subjectIds.length) return;
      await db.delete(notificationsTable).where(inArray(notificationsTable.subjectId, subjectIds));
      await db.delete(attachmentsTable).where(inArray(attachmentsTable.id, subjectIds));
    });

    it('adds no mention on an update that leaves the description alone', async () => {
      const subjectId = await newSubject();
      expect((await putDescription(mentionsOf([member.id]), subjectId)).response.status).toBe(200);

      const renamed = updatedEvent(tenant.user.id, { subjectId, changedFields: ['name', 'updatedAt'] });
      // A rename can notify no one on a source without a recipient rule, so the fan-out does not read the row at all.
      const read = vi.spyOn(baseDb, 'transaction');
      onTestFinished(() => read.mockRestore());
      expect(await fanOutNotifications(renamed)).toBe(false);
      expect(read).not.toHaveBeenCalled();
      expect(await inboxOf(member.id, subjectId)).toEqual([]);
    });

    it('mentions each user a description change adds, once', async () => {
      // Stored without the update op: the fan-out reads whatever body the row holds.
      const subjectId = await newSubject(mentionsOf([member.id]));
      expect(await fanOutNotifications(createdEvent(subjectId))).toBe(true);
      expect(await inboxOf(member.id, subjectId)).toEqual([{ type: 'mention' }]);

      expect((await putDescription(mentionsOf([member.id, other.id]), subjectId)).response.status).toBe(200);
      expect(await fanOutNotifications(updatedEvent(tenant.user.id, { subjectId }))).toBe(true);
      expect(await fanOutNotifications(updatedEvent(tenant.user.id, { subjectId }))).toBe(false);
      expect(await inboxOf(member.id, subjectId)).toEqual([{ type: 'mention' }]);
      expect(await inboxOf(other.id, subjectId)).toEqual([{ type: 'mention' }]);
    });

    it('mentions the users of every row of an event of several rows, whatever its changed fields say', async () => {
      const subjectIds = [await newSubject(mentionsOf([member.id])), await newSubject(mentionsOf([other.id]))];

      // The changed fields are those of the first row alone: they say nothing about the description of the second.
      const renamed = updatedEvent(tenant.user.id, { changedFields: ['name', 'updatedAt'] }, subjectIds);
      expect(await fanOutNotifications(renamed)).toBe(true);

      expect(await inboxOf(member.id, subjectIds[0])).toEqual([{ type: 'mention' }]);
      expect(await inboxOf(other.id, subjectIds[1])).toEqual([{ type: 'mention' }]);
    });

    it('notifies nobody about a mention of an account without read access', async () => {
      const subjectId = await newSubject();
      expect((await putDescription(mentionsOf([stranger.id]), subjectId)).response.status).toBe(200);

      expect(await fanOutNotifications(updatedEvent(tenant.user.id, { subjectId }))).toBe(false);
      expect(await inboxOf(stranger.id, subjectId)).toEqual([]);
    });

    it('sends no mention from a source declared mentionable: false', async () => {
      const source = getNotificationSource('attachment');
      if (!source) throw new Error('attachment notification source not registered');
      source.declaration.mentionable = false;
      onTestFinished(() => {
        delete source.declaration.mentionable;
      });

      const subjectId = await newSubject(mentionsOf([member.id]));
      expect(await fanOutNotifications(createdEvent(subjectId))).toBe(false);
      expect(await inboxOf(member.id, subjectId)).toEqual([]);
    });
  });

  // The template emits no comment or reply rows (an app's `resolveRecipients` does), so these tests write the rows
  // directly, or give the attachment source a recipient resolver for one test.
  describe('comment emails', () => {
    /** A second live subject, so the reply mail is not folded into the comment mail on `attachmentId`. */
    const replySubjectId = generateId();

    const rowOf = (type: 'mention' | 'comment' | 'reply', subjectId = attachmentId) => ({
      userId: member.id,
      actorId: tenant.user.id,
      type,
      entityType: 'attachment' as const,
      subjectId,
      contextId: subjectId,
      channelId: tenant.organization.id,
      channelType: 'organization' as const,
      organizationId: tenant.organization.id,
      tenantId: tenant.tenantId,
      activityId: `act:${generateId()}`,
    });

    /** Rows for this test only: a row the pass leaves pending must not reach the next test's pass. */
    const insertRows = async (...rows: ReturnType<typeof rowOf>[]) => {
      const inserted = await db.insert(notificationsTable).values(rows).returning({ id: notificationsTable.id });
      const ids = inserted.map(({ id }) => id);
      onTestFinished(async () => {
        await db.delete(notificationsTable).where(inArray(notificationsTable.id, ids));
      });
      return ids;
    };

    /** The given rows the instant pass has not taken; the digest still covers these. */
    const unemailed = async (ids: string[]) =>
      (
        await db
          .select({ id: notificationsTable.id, emailedAt: notificationsTable.emailedAt })
          .from(notificationsTable)
          .where(inArray(notificationsTable.id, ids))
      ).filter(({ emailedAt }) => emailedAt === null);

    const setCommentEmail = (commentEmail: boolean) =>
      db
        .insert(notificationPreferencesTable)
        .values({ userId: member.id, commentEmail })
        .onConflictDoUpdate({ target: notificationPreferencesTable.userId, set: { commentEmail } });

    const offerCommentEmail = () => onTestFinished(overrideConfig(appConfig.has, { commentEmail: true }));
    // Each case starts with comment email not offered, whatever the app's default is.
    let restoreCommentEmail: () => void;

    beforeAll(async () => {
      restoreCommentEmail = overrideConfig(appConfig.has, { commentEmail: false });
      const row = buildInsertableProduct(
        'attachment',
        { id: replySubjectId, tenantId: tenant.tenantId, ...plan.channelIdColumns, createdBy: tenant.user.id, updatedBy: null, deletedBy: null },
        replySubjectId,
      );
      await insertAttachmentRow(row);
    });

    afterAll(async () => {
      restoreCommentEmail();
      await db.delete(notificationsTable).where(eq(notificationsTable.subjectId, replySubjectId));
      await db.delete(attachmentsTable).where(eq(attachmentsTable.id, replySubjectId));
      await db.delete(notificationPreferencesTable).where(eq(notificationPreferencesTable.userId, member.id));
    });

    it('mails comment and reply rows when the app offers comment email and the recipient turned it on', async () => {
      offerCommentEmail();
      await setCommentEmail(true);
      const ids = await insertRows(rowOf('comment'), rowOf('reply', replySubjectId));

      await sendPendingInstantEmails(tenant.organization.id);

      const mails = mailsTo(member.email);
      expect(mails.map(({ template, statics }) => [template, statics.reply])).toEqual(
        expect.arrayContaining([
          [commentEmail, false],
          [commentEmail, true],
        ]),
      );
      expect(mails).toHaveLength(2);
      for (const { recipient } of mails) expect(String(recipient.unsubscribeLink)).toContain('category=comment');
      expect(await unemailed(ids)).toEqual([]);
    });

    it('leaves comment rows to the digest when the recipient keeps comment email off', async () => {
      offerCommentEmail();
      await setCommentEmail(false);
      const ids = await insertRows(rowOf('comment'));

      await sendPendingInstantEmails(tenant.organization.id);

      expect(mailsTo(member.email)).toEqual([]);
      expect(await unemailed(ids)).toHaveLength(1);
    });

    it('mails no comment row while the app does not offer comment email', async () => {
      expect(appConfig.has.commentEmail).toBe(false);
      await setCommentEmail(true);
      const ids = await insertRows(rowOf('comment'));

      await sendPendingInstantEmails(tenant.organization.id);

      expect(mailsTo(member.email)).toEqual([]);
      expect(await unemailed(ids)).toHaveLength(1);
    });

    it('mails a mention and a comment on the same subject once, as the mention', async () => {
      offerCommentEmail();
      await setCommentEmail(true);
      const ids = await insertRows(rowOf('comment'), rowOf('mention'));

      await sendPendingInstantEmails(tenant.organization.id);

      expect(mailsTo(member.email).map(({ template }) => template)).toEqual([mentionEmail]);
      // The mention mail settles the comment too, so the digest does not repeat it.
      expect(await unemailed(ids)).toEqual([]);
    });

    it('reports a fan-out that wrote a comment row as mailable only while the app offers comment email', async () => {
      const source = getNotificationSource('attachment');
      if (!source) throw new Error('attachment notification source not registered');
      source.declaration.resolveRecipients = async () => [{ userId: member.id, type: 'comment' }];
      onTestFinished(() => {
        delete source.declaration.resolveRecipients;
      });
      // A create event: an update skips recipients already notified about the subject.
      const createdEvent = () => updatedEvent(tenant.user.id, { type: 'attachment.created', action: 'create', subjectId: replySubjectId });

      expect(await fanOutNotifications(createdEvent())).toBe(false);
      offerCommentEmail();
      expect(await fanOutNotifications(createdEvent())).toBe(true);
      const written = await db
        .select({ type: notificationsTable.type })
        .from(notificationsTable)
        .where(eq(notificationsTable.subjectId, replySubjectId));
      expect(written).toEqual([{ type: 'comment' }, { type: 'comment' }]);
    });
  });
});
