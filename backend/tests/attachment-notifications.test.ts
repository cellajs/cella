import { and, eq, inArray } from 'drizzle-orm';
import { type GetNotificationsResponse, getNotifications, updateAttachment } from 'sdk';
import { appConfig } from 'shared';
import { buildTestEntityHierarchyPlan, type TestEntityHierarchyPlan } from 'shared/testing/entity-hierarchy';
import { generateId } from 'shared/utils/entity-id';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateServerHLC } from '#/core/stx';
import { baseDb as db } from '#/db/db';
import type { ActivityEvent } from '#/lib/activity-bus';
import { buildInsertableProduct } from '#/mocks';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { notificationsTable } from '#/modules/notification/notification-db';
import { fanOutNotifications } from '#/modules/notification/operations/fan-out';
import { sendPendingInstantEmails } from '#/modules/notification/operations/send-instant-emails';
import { materializeDescriptionOp } from '#/modules/yjs/operations/materialize-description';
import { mockStxBase } from '#/schemas/sync-transaction-mocks';
import { defaultHeaders } from './fixtures';
import { cleanupEntityHierarchy, seedEntityHierarchy } from './hierarchy-helpers';
import { clearSecurityTestData, createOrgUser, createTestTenant, type TestTenant } from './security/helpers';
import { createAppClient } from './test-client';
import { mockFetchRequest, setTestConfig } from './test-utils';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

const attachmentId = generateId();
// UUID-shaped id with no user behind it (doctored mention node)
const strangerId = generateId();

const paragraphWithMentions = (ids: string[]) => ({
  id: generateId(),
  type: 'paragraph',
  props: {},
  content: ids.map((id) => ({ type: 'mention', props: { id, name: 'someone', slug: 'someone' } })),
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
  let member: { id: string; sessionCookie: string };
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
    mockFetchRequest();
    tenant = await createTestTenant(call, 'attachment-mentions');
    member = await createOrgUser(call, tenant.tenantId, tenant.organization.id, 'attachment-mentions-member');

    plan = buildTestEntityHierarchyPlan({
      entityType: 'attachment',
      organizationId: tenant.organization.id,
      makeChannelId: () => generateId(),
    });
    await seedEntityHierarchy(db, plan, {
      tenantId: tenant.tenantId,
      createdBy: tenant.user.id,
      slugPrefix: 'attachment-mentions',
    });

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
    // buildInsertableProduct returns a config-derived Record, so the insert type needs a cast.
    await db.insert(attachmentsTable).values(row as typeof attachmentsTable.$inferInsert);
  });

  afterAll(async () => {
    await db.delete(notificationsTable).where(inArray(notificationsTable.subjectId, [attachmentId]));
    await db.delete(attachmentsTable).where(eq(attachmentsTable.id, attachmentId));
    await cleanupEntityHierarchy(db, plan);
    await clearSecurityTestData();
  });

  it('stores readable mentioned users and drops ids without read access', async () => {
    const result = await putDescription(JSON.stringify([paragraphWithMentions([member.id, strangerId])]));
    expect(result.response.status).toBe(200);
    expect(await storedMentions()).toEqual([member.id]);
  });

  it('clears mentions once the description no longer carries them', async () => {
    const result = await putDescription(JSON.stringify([paragraphWithMentions([])]));
    expect(result.response.status).toBe(200);
    expect(await storedMentions()).toEqual([]);
  });

  it('derives from Yjs materialization too, the write path of the collaborative editor', async () => {
    await materializeDescriptionOp({
      entityType: 'attachment',
      entityId: attachmentId,
      tenantId: tenant.tenantId,
      organizationId: tenant.organization.id,
      description: JSON.stringify([paragraphWithMentions([member.id])]),
      editedBy: tenant.user.id,
    });
    expect(await storedMentions()).toEqual([member.id]);
  });

  it('fans out a mention to the inbox and mails it instantly, never to the actor', async () => {
    await fanOutNotifications(updatedEvent(member.id));
    expect(await notificationsFor(member.id)).toEqual([]);

    await fanOutNotifications(updatedEvent(tenant.user.id));
    expect(await notificationsFor(member.id)).toEqual([{ type: 'mention', emailedAt: null }]);

    // Mention email is on by default; the member's address is verified.
    await sendPendingInstantEmails(tenant.organization.id);
    expect((await notificationsFor(member.id))[0]?.emailedAt).not.toBeNull();
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
});
