import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { type ListNotificationsResponse, listNotifications, updateAttachment } from 'sdk';
import { appConfig, publicReadGrants } from 'shared';
import type { TestEntityHierarchyPlan } from 'shared/testing/entity-hierarchy';
import { generateId } from 'shared/utils/entity-id';
import { afterAll, beforeAll, describe, expect, it, onTestFinished, vi } from 'vitest';
import { baseDb, getSeedDb } from '#/db/db';
import type { ActivityRow, ProductActivityEvent } from '#/lib/activity-bus';
import { mailer } from '#/lib/mailer';
import { buildInsertableProduct } from '#/mocks';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { sendSignal } from '#/modules/entities/stream/send-signal';
import { commentEmail } from '#/modules/notification/emails/comment-email';
import { mentionEmail } from '#/modules/notification/emails/mention-email';
import { notificationPreferencesTable, notificationsTable } from '#/modules/notification/notification-db';
import { getNotificationSource } from '#/modules/notification/notification-sources';
import { buildDigestForUser } from '#/modules/notification/operations/build-digest';
import { fanOutNotifications } from '#/modules/notification/operations/fan-out';
import { sendNotificationPush } from '#/modules/push/push-sender';
import { materializeDescriptionOp } from '#/modules/yjs/operations/materialize-description';
import { mockStxFor } from '#/schemas/sync-transaction-mocks';
import { adminRole, defaultHeaders, overrideConfig } from './fixtures';
import { createTestUser, failNextMailSend, mailsTo, sentMails } from './helpers';
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

// Signals go out as in the app and are recorded.
vi.mock('#/modules/entities/stream/send-signal', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#/modules/entities/stream/send-signal')>();
  return { sendSignal: vi.fn(actual.sendSignal) };
});

/** Who heard of a write since the mocks were cleared: the inbox signal, the push and the mail. */
const heard = () => ({
  signalled: vi
    .mocked(sendSignal)
    .mock.calls.flatMap(([type, audience]) => (type === 'notification.created' && audience.kind === 'user' ? [audience.userId] : [])),
  pushed: vi.mocked(sendNotificationPush).mock.calls.flatMap(([userIds]) => userIds),
  mailed: sentMails().map(({ recipient }) => recipient.email),
});

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

const updateStx = () => mockStxFor('description');

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
      path: { organizationId: tenant.organization.id, tenantId: tenant.tenantId, attachmentId: id },
      body: { ops: { description }, stx: updateStx() },
      headers: { ...defaultHeaders, Cookie: tenant.sessionCookie },
    });

  const storedKeywords = async () => {
    const [row] = await db.select({ keywords: attachmentsTable.keywords }).from(attachmentsTable).where(eq(attachmentsTable.id, attachmentId));
    return row.keywords;
  };

  const notificationsFor = (userId: string) =>
    db
      .select({ kind: notificationsTable.kind, emailedAt: notificationsTable.emailedAt })
      .from(notificationsTable)
      .where(and(eq(notificationsTable.userId, userId), eq(notificationsTable.subjectId, attachmentId)));

  /** One row's change as a message carries it: the activity of its write, by `writer`, and the row's id. */
  const changedRow = (subjectId: string, writer: string, changedFields: string[] | null = ['description']): ActivityRow => ({
    activityId: `act:${generateId()}`,
    userId: writer,
    changedFields,
    stx: null,
    rowData: { id: subjectId, organizationId: tenant.organization.id },
  });

  /** A product event of attachment rows as the bus delivers it; `action` defaults to an update. */
  const productEvent = (rows: ActivityRow[], action: 'create' | 'update' = 'update'): ProductActivityEvent =>
    // Test mock: the CDC worker fills the remaining columns; the fan-out reads only these.
    ({
      type: action === 'create' ? 'attachment.created' : 'attachment.updated',
      action,
      entityType: 'attachment',
      resourceType: null,
      tableName: 'attachments',
      tenantId: tenant.tenantId,
      organizationId: tenant.organization.id,
      ...nullAncestorScopes,
      rowData: null,
      trace: null,
      rows,
    }) as unknown as ProductActivityEvent;

  /** A change of one attachment by `writer`, a description edit unless `changedFields` says otherwise. */
  const updatedEvent = (
    writer: string,
    {
      subjectId = attachmentId,
      action = 'update',
      changedFields = action === 'update' ? ['description'] : null,
    }: { subjectId?: string; action?: 'create' | 'update'; changedFields?: string[] | null } = {},
  ) => productEvent([changedRow(subjectId, writer, changedFields)], action);

  /** The create of a subject by the owner, as its first delivery or a republish brings it. */
  const createdEvent = (subjectId: string) => updatedEvent(tenant.user.id, { subjectId, action: 'create' });

  /** Subjects of one test each, so one test's inbox rows never dedupe another's. */
  const subjectIds: string[] = [];

  const newSubject = async (description: string | null = null, columns: { public?: boolean; name?: string } = {}) => {
    const id = generateId();
    subjectIds.push(id);
    const row = buildInsertableProduct(
      'attachment',
      {
        id,
        tenantId: tenant.tenantId,
        ...plan.channelIdColumns,
        description,
        createdBy: tenant.user.id,
        updatedBy: null,
        deletedBy: null,
        ...columns,
      },
      id,
    );
    await insertAttachmentRow(row);
    return id;
  };

  const inboxOf = (userId: string, subjectId: string) =>
    db
      .select({ kind: notificationsTable.kind })
      .from(notificationsTable)
      .where(and(eq(notificationsTable.userId, userId), eq(notificationsTable.subjectId, subjectId)));

  const attachmentSource = () => {
    const source = getNotificationSource('attachment');
    if (!source) throw new Error('attachment notification source not registered');
    return source;
  };

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
    await db.delete(notificationsTable).where(inArray(notificationsTable.subjectId, [attachmentId, ...subjectIds]));
    await db.delete(attachmentsTable).where(inArray(attachmentsTable.id, [attachmentId, ...subjectIds]));
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
      serverRowIds: [],
    });
    const keywords = await storedKeywords();
    expect(keywords).toContain('signed contract');
    expect(keywords).not.toContain('quarterly budget');
  });

  it('stores a description that holds a NUL character on both write paths, and refuses one in the sync metadata', async () => {
    // Postgres takes a NUL in no text value. The stored body escapes it; the columns derived from the body leave it out.
    expect((await putDescription(JSON.stringify([paragraphWithText('quarter\u0000ly')]))).response.status).toBe(200);
    expect(await storedKeywords()).toBe('quarterly');

    await materializeDescriptionOp({
      entityType: 'attachment',
      entityId: attachmentId,
      tenantId: tenant.tenantId,
      organizationId: tenant.organization.id,
      description: JSON.stringify([paragraphWithText('con\u0000tract')]),
      editors: [tenant.user.id],
      serverRowIds: [],
    });
    expect(await storedKeywords()).toBe('contract');

    const withNulInStx = await call(updateAttachment, {
      path: { organizationId: tenant.organization.id, tenantId: tenant.tenantId, attachmentId },
      body: { ops: { description: JSON.stringify([paragraphWithText('kept')]) }, stx: { ...updateStx(), mutationId: 'stx:\u0000' } },
      headers: { ...defaultHeaders, Cookie: tenant.sessionCookie },
    });
    expect(withNulInStx.response.status).toBe(400);
  });

  it('fans out a mention a Yjs materialization wrote to the inbox and mails it instantly, never to the actor', async () => {
    await materializeDescriptionOp({
      entityType: 'attachment',
      entityId: attachmentId,
      tenantId: tenant.tenantId,
      organizationId: tenant.organization.id,
      description: JSON.stringify([paragraphWithText('please sign the contract'), paragraphWithMentions([member.id])]),
      editors: [tenant.user.id],
      serverRowIds: [],
    });

    await fanOutNotifications(updatedEvent(member.id));
    expect(await notificationsFor(member.id)).toEqual([]);

    await fanOutNotifications(updatedEvent(tenant.user.id));
    // Mention email is on by default and the member's address is verified, so the fan-out mails the row it wrote.
    const [told] = await notificationsFor(member.id);
    expect(told?.kind).toBe('mention');
    expect(told?.emailedAt).not.toBeNull();
    // Titled with the name the inbox shows, quoting the body the fan-out read.
    const [{ name }] = await db.select({ name: attachmentsTable.name }).from(attachmentsTable).where(eq(attachmentsTable.id, attachmentId));
    const mails = mailsTo(member.email);
    expect(mails).toHaveLength(1);
    expect(mails[0]?.recipient).toMatchObject({ subjectTitle: name, excerpt: expect.stringContaining('please sign the contract') });
    // The push link opens the notification's context, which defaults to the row itself.
    const [, payload] = vi.mocked(sendNotificationPush).mock.calls.at(-1) ?? [];
    expect(linkedContextId(payload?.url)).toBe(attachmentId);
  });

  it('links and titles the mention mail by the notification context, the item hosting the subject', async () => {
    const hostId = generateId();
    const source = attachmentSource();
    source.declaration.resolveContextId = () => hostId;
    source.declaration.loadContextNames = async (_tx, ids) => new Map(ids.map((id) => [id, id === hostId ? 'Host item' : '']));
    onTestFinished(() => {
      delete source.declaration.resolveContextId;
      delete source.declaration.loadContextNames;
    });
    const subjectId = await newSubject(mentionsOf([member.id]));

    await fanOutNotifications(createdEvent(subjectId));
    const [mail] = mailsTo(member.email);
    expect(linkedContextId(mail?.recipient.link)).toBe(hostId);
    expect(mail?.recipient.subjectTitle).toBe('Host item');
  });

  it('leaves a mention whose mail failed unstamped, for the digest', async () => {
    const subjectId = await newSubject(mentionsOf([member.id]), { name: 'Unmailed item' });

    failNextMailSend();
    await fanOutNotifications(createdEvent(subjectId));
    expect(mailsTo(member.email)).toHaveLength(1);

    const [row] = await db
      .select({ emailedAt: notificationsTable.emailedAt })
      .from(notificationsTable)
      .where(and(eq(notificationsTable.userId, member.id), eq(notificationsTable.subjectId, subjectId)));
    expect(row?.emailedAt).toBeNull();
    const minute = 60 * 1000;
    const window = { since: new Date(Date.now() - minute).toISOString(), before: new Date(Date.now() + minute).toISOString() };
    const sections = await buildDigestForUser({ var: { db: baseDb } }, { userId: member.id, ...window, lng: 'en' });
    expect(sections.flatMap((section) => section.lines).join()).toContain('Unmailed item');
  });

  it('lists the inbox row with the actor, channel and subject the card sentence needs', async () => {
    const result = await call(listNotifications, { query: { maxPageSize: 10 }, headers: { ...defaultHeaders, Cookie: member.sessionCookie } });
    expect(result.response.status).toBe(200);
    // The test client types the body loosely; the SDK response type names the fields under test.
    const items = (result.data as ListNotificationsResponse | undefined)?.results ?? [];
    const row = items.find((item) => item.subjectId === attachmentId);
    expect(row).toMatchObject({ kind: 'mention', subjectId: attachmentId, entityType: 'attachment' });
    expect(row?.actor?.id).toBe(tenant.user.id);
    expect(row?.channelName).not.toBe('');
    expect(row?.subjectTitle).not.toBe('');
  });

  it('lists the newest rows on the first page of an inbox longer than one page', async () => {
    const reader = await createOrgUser(call, tenant.tenantId, tenant.organization.id, 'attachment-mentions-reader', adminRole);
    const rowAt = (createdAt: Date) => ({
      createdAt: createdAt.toISOString(),
      userId: reader.id,
      actorId: tenant.user.id,
      kind: 'mention' as const,
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
    await db.insert(notificationsTable).values(Array.from({ length: 30 }, () => rowAt(anHourAgo)));
    const [newest] = await db.insert(notificationsTable).values(rowAt(new Date())).returning({ id: notificationsTable.id });

    const result = await call(listNotifications, { query: { maxPageSize: 30 }, headers: { ...defaultHeaders, Cookie: reader.sessionCookie } });
    const items = (result.data as ListNotificationsResponse | undefined)?.results ?? [];
    expect(items).toHaveLength(30);
    expect(items[0]?.id).toBe(newest.id);
  });

  it('mails a fresh mention at once, and none of the unmailed rows the member already holds', async () => {
    // Rows held unmailed, as a member who had mention email off holds them; more than an organization-wide pass took.
    const anHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const backlog = await db
      .insert(notificationsTable)
      .values(
        Array.from({ length: 201 }, () => ({
          createdAt: anHourAgo,
          userId: member.id,
          actorId: tenant.user.id,
          kind: 'mention' as const,
          entityType: 'attachment' as const,
          subjectId: attachmentId,
          contextId: attachmentId,
          channelId: tenant.organization.id,
          channelType: 'organization' as const,
          organizationId: tenant.organization.id,
          tenantId: tenant.tenantId,
          activityId: `act:${generateId()}`,
        })),
      )
      .returning({ id: notificationsTable.id });
    const backlogIds = backlog.map(({ id }) => id);
    onTestFinished(async () => void (await db.delete(notificationsTable).where(inArray(notificationsTable.id, backlogIds))));
    const subjectId = await newSubject(mentionsOf([member.id]));

    await fanOutNotifications(createdEvent(subjectId));

    expect(mailsTo(member.email).map(({ recipient }) => linkedContextId(recipient.link))).toEqual([subjectId]);
    const stamped = await db
      .select({ id: notificationsTable.id })
      .from(notificationsTable)
      .where(and(inArray(notificationsTable.id, backlogIds), isNotNull(notificationsTable.emailedAt)));
    expect(stamped).toEqual([]);
  });

  describe('mentions read from the stored body', () => {
    /** A second readable member, mentioned next to `member`. */
    let other: { id: string; email: string };

    beforeAll(async () => {
      other = await createOrgUser(call, tenant.tenantId, tenant.organization.id, 'attachment-mentions-other', adminRole);
    });

    it('adds no mention on an update that leaves the description alone', async () => {
      const subjectId = await newSubject();
      expect((await putDescription(mentionsOf([member.id]), subjectId)).response.status).toBe(200);

      const renamed = updatedEvent(tenant.user.id, { subjectId, changedFields: ['name', 'updatedAt'] });
      // A rename can notify no one on a source without a recipient rule, so the fan-out does not read the row at all.
      const read = vi.spyOn(baseDb, 'transaction');
      onTestFinished(() => read.mockRestore());
      await fanOutNotifications(renamed);
      expect(read).not.toHaveBeenCalled();
      expect(await inboxOf(member.id, subjectId)).toEqual([]);
    });

    it('mentions each user a description change adds, once, and signals, pushes and mails nobody told before', async () => {
      // Stored without the update op: the fan-out reads whatever body the row holds.
      const subjectId = await newSubject(mentionsOf([member.id]));
      await fanOutNotifications(createdEvent(subjectId));
      expect(await inboxOf(member.id, subjectId)).toEqual([{ kind: 'mention' }]);

      expect((await putDescription(mentionsOf([member.id, other.id]), subjectId)).response.status).toBe(200);
      vi.clearAllMocks();
      await fanOutNotifications(updatedEvent(tenant.user.id, { subjectId }));
      expect(heard()).toEqual({ signalled: [other.id], pushed: [other.id], mailed: [other.email] });

      vi.clearAllMocks();
      await fanOutNotifications(updatedEvent(tenant.user.id, { subjectId }));
      expect(heard()).toEqual({ signalled: [], pushed: [], mailed: [] });
      expect(await inboxOf(member.id, subjectId)).toEqual([{ kind: 'mention' }]);
      expect(await inboxOf(other.id, subjectId)).toEqual([{ kind: 'mention' }]);
    });

    it('tells nobody again when a change is delivered twice or the row is published again', async () => {
      const subjectId = await newSubject(mentionsOf([member.id]));
      const created = createdEvent(subjectId);
      await fanOutNotifications(created);
      expect(heard()).toEqual({ signalled: [member.id], pushed: [member.id], mailed: [member.email] });

      // The CDC worker delivers at least once; a republish arrives as a create of its own activity.
      vi.clearAllMocks();
      await fanOutNotifications(created);
      await fanOutNotifications(createdEvent(subjectId));
      expect(heard()).toEqual({ signalled: [], pushed: [], mailed: [] });
      expect(await inboxOf(member.id, subjectId)).toEqual([{ kind: 'mention' }]);
    });

    it('writes one row per user when two deliveries of one change overlap', async () => {
      // The bus runs the listeners of two deliveries side by side, so both inserts can test the guard before either
      // commits. A process's first overlap seldom races, so three run.
      for (let attempt = 0; attempt < 3; attempt++) {
        const subjectId = await newSubject(mentionsOf([member.id, other.id]));
        const created = createdEvent(subjectId);
        vi.clearAllMocks();
        await Promise.all([fanOutNotifications(created), fanOutNotifications(created)]);

        expect(await inboxOf(member.id, subjectId)).toEqual([{ kind: 'mention' }]);
        expect(await inboxOf(other.id, subjectId)).toEqual([{ kind: 'mention' }]);
        expect(heard().signalled.toSorted()).toEqual([member.id, other.id].toSorted());
      }
    });

    it('stamps each mention right after its mail, so a stop before the next send leaves no mailed row for the digest', async () => {
      const subjectId = await newSubject(mentionsOf([member.id, other.id]));
      const stampedRows = async () =>
        (
          await db
            .select({ id: notificationsTable.id })
            .from(notificationsTable)
            .where(and(eq(notificationsTable.subjectId, subjectId), isNotNull(notificationsTable.emailedAt)))
        ).length;

      // The second send reads what the first one left, as a process that stopped there would leave it.
      let stampedAtSecondSend: number | undefined;
      vi.mocked(mailer.sendEmails)
        .mockImplementationOnce(async () => undefined)
        .mockImplementationOnce(async () => {
          stampedAtSecondSend = await stampedRows();
        });

      await fanOutNotifications(createdEvent(subjectId));
      expect(stampedAtSecondSend).toBe(1);
      expect(await stampedRows()).toBe(2);
    });

    it('reads the mentions of each row of an event of several rows by the fields that row changed', async () => {
      const [renamed, edited] = [await newSubject(mentionsOf([member.id])), await newSubject(mentionsOf([other.id]))];

      // One flush: a rename of the first row and a description edit of the second.
      const event = productEvent([changedRow(renamed, tenant.user.id, ['name', 'updatedAt']), changedRow(edited, tenant.user.id)]);
      await fanOutNotifications(event);

      expect(await inboxOf(member.id, renamed)).toEqual([]);
      expect(await inboxOf(other.id, edited)).toEqual([{ kind: 'mention' }]);
    });

    it('tells each row of one flush under its own writer and activity, two writers mentioning each other', async () => {
      // A flush groups the transactions of several writers: the owner edits the first row, `other` the second.
      const first = await newSubject(mentionsOf([member.id, other.id]));
      const second = await newSubject(mentionsOf([member.id, tenant.user.id, other.id]));
      const rows = [changedRow(first, tenant.user.id), changedRow(second, other.id)];

      await fanOutNotifications(productEvent(rows));

      const told = await db
        .select({
          userId: notificationsTable.userId,
          subjectId: notificationsTable.subjectId,
          actorId: notificationsTable.actorId,
          activityId: notificationsTable.activityId,
        })
        .from(notificationsTable)
        .where(inArray(notificationsTable.subjectId, [first, second]));
      const byWrite = (subjectId: string) =>
        told
          .filter((row) => row.subjectId === subjectId)
          .map(({ userId, actorId, activityId }) => ({ userId, actorId, activityId }))
          .sort((a, b) => a.userId.localeCompare(b.userId));
      const expected = (row: ActivityRow, userIds: string[]) =>
        userIds.map((userId) => ({ userId, actorId: row.userId, activityId: row.activityId })).sort((a, b) => a.userId.localeCompare(b.userId));

      // One user mentioned in both rows hears of both; the second writer's mention of the first is no self-mention.
      expect(byWrite(first)).toEqual(expected(rows[0], [member.id, other.id]));
      expect(byWrite(second)).toEqual(expected(rows[1], [member.id, tenant.user.id]));
      expect(heard().signalled.toSorted()).toEqual([member.id, member.id, other.id, tenant.user.id].toSorted());
    });

    it('notifies nobody about a mention of an account without read access', async () => {
      const subjectId = await newSubject();
      expect((await putDescription(mentionsOf([stranger.id]), subjectId)).response.status).toBe(200);

      await fanOutNotifications(updatedEvent(tenant.user.id, { subjectId }));
      expect(await inboxOf(stranger.id, subjectId)).toEqual([]);
    });

    it('notifies the users mentioned in a public row next to an id that names no user', async () => {
      // A public row reads for any id, so only the lookup of the account itself can leave the unknown id out.
      publicReadGrants.attachment = true;
      onTestFinished(() => void delete publicReadGrants.attachment);
      const subjectId = await newSubject(mentionsOf([generateId(), member.id]), { public: true });

      await fanOutNotifications(createdEvent(subjectId));
      expect(await inboxOf(member.id, subjectId)).toEqual([{ kind: 'mention' }]);
    });
  });

  // The template declares no recipient rule (an app's `resolveRecipients` does), so these tests give the attachment
  // source one that names `member` with the kind under test.
  describe('comment emails', () => {
    /** Fans out the create of a new subject whose recipient rule names `member` as `kind`. */
    const fanOutAs = async (kind: 'comment' | 'reply', description: string | null = null) => {
      const source = attachmentSource();
      source.declaration.resolveRecipients = async () => [{ userId: member.id, kind }];
      onTestFinished(() => void delete source.declaration.resolveRecipients);
      const subjectId = await newSubject(description);
      await fanOutNotifications(createdEvent(subjectId));
      return subjectId;
    };

    /** The member's rows on the subject, and whether its instant mail went out; the digest covers an unmailed one. */
    const rowsOf = async (subjectId: string) =>
      (
        await db
          .select({ kind: notificationsTable.kind, emailedAt: notificationsTable.emailedAt })
          .from(notificationsTable)
          .where(and(eq(notificationsTable.userId, member.id), eq(notificationsTable.subjectId, subjectId)))
      ).map(({ kind, emailedAt }) => ({ kind, emailed: emailedAt !== null }));

    const setCommentEmail = (commentEmail: boolean) =>
      db
        .insert(notificationPreferencesTable)
        .values({ userId: member.id, commentEmail })
        .onConflictDoUpdate({ target: notificationPreferencesTable.userId, set: { commentEmail } });

    const offerCommentEmail = () => onTestFinished(overrideConfig(appConfig.has, { commentEmail: true }));
    // Each case starts with comment email not offered, whatever the app's default is.
    let restoreCommentEmail: () => void;

    beforeAll(() => {
      restoreCommentEmail = overrideConfig(appConfig.has, { commentEmail: false });
    });

    afterAll(async () => {
      restoreCommentEmail();
      await db.delete(notificationPreferencesTable).where(eq(notificationPreferencesTable.userId, member.id));
    });

    it('mails the comment and reply rows a fan-out writes once the recipient turns comment email on, and no older row', async () => {
      offerCommentEmail();
      // Written while the recipient had comment email off: turning it on mails what comes next only.
      await setCommentEmail(false);
      const older = await fanOutAs('comment');
      await setCommentEmail(true);
      const comment = await fanOutAs('comment');
      const reply = await fanOutAs('reply');

      const mails = mailsTo(member.email);
      expect(mails.map(({ template, statics }) => [template, statics.reply])).toEqual([
        [commentEmail, false],
        [commentEmail, true],
      ]);
      for (const { recipient } of mails) expect(String(recipient.unsubscribeLink)).toContain('category=comment');
      expect(await rowsOf(comment)).toEqual([{ kind: 'comment', emailed: true }]);
      expect(await rowsOf(reply)).toEqual([{ kind: 'reply', emailed: true }]);
      expect(await rowsOf(older)).toEqual([{ kind: 'comment', emailed: false }]);
    });

    it('leaves comment rows to the digest when the recipient keeps comment email off', async () => {
      offerCommentEmail();
      await setCommentEmail(false);
      const subjectId = await fanOutAs('comment');

      expect(mailsTo(member.email)).toEqual([]);
      expect(await rowsOf(subjectId)).toEqual([{ kind: 'comment', emailed: false }]);
    });

    it('mails no comment row while the app does not offer comment email', async () => {
      expect(appConfig.has.commentEmail).toBe(false);
      await setCommentEmail(true);
      const subjectId = await fanOutAs('comment');

      expect(mailsTo(member.email)).toEqual([]);
      expect(await rowsOf(subjectId)).toEqual([{ kind: 'comment', emailed: false }]);
    });

    it('mails a mention and a comment on the same subject once, as the mention', async () => {
      offerCommentEmail();
      await setCommentEmail(true);
      // The mention outranks the comment for the same user, so one row is written and mailed.
      const subjectId = await fanOutAs('comment', mentionsOf([member.id]));

      expect(mailsTo(member.email).map(({ template }) => template)).toEqual([mentionEmail]);
      expect(await rowsOf(subjectId)).toEqual([{ kind: 'mention', emailed: true }]);
    });
  });
});
