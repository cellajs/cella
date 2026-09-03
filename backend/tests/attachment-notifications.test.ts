import { and, eq, inArray } from 'drizzle-orm';
import { updateAttachment } from 'sdk';
import { appConfig } from 'shared';
import { buildTestEntityHierarchyPlan, type TestEntityHierarchyPlan } from 'shared/testing/entity-hierarchy';
import { generateId } from 'shared/utils/entity-id';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateServerHLC } from '#/core/stx';
import { baseDb as db } from '#/db/db';
import type { ActivityEvent } from '#/lib/activity-bus';
import { type MutationPayload, registerMutationHandler } from '#/lib/mutation-bus';
import { buildInsertableProduct } from '#/mocks';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { notificationPreferencesTable, notificationsTable } from '#/modules/notification/notification-db';
import { findOrCreatePreferences, updatePreferences } from '#/modules/notification/notification-queries';
import { fanOutNotifications } from '#/modules/notification/operations/fan-out';
import { sendPendingInstantEmails } from '#/modules/notification/operations/send-instant-emails';
import { mockStxBase } from '#/schemas/sync-transaction-mocks';
import { defaultHeaders } from './fixtures';
import { cleanupEntityHierarchy, seedEntityHierarchy } from './hierarchy-helpers';
import { clearSecurityTestData, createOrgUser, createTestTenant, type TestTenant } from './security/helpers';
import { createAppClient } from './test-client';
import { mockFetchRequest, setTestConfig } from './test-utils';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

const memberUpload = generateId();
const adminUpload = generateId();

const updateStx = () => ({
  ...mockStxBase(`stx:${generateId()}`),
  fieldTimestamps: { name: generateServerHLC('test-client') },
});

const nullAncestorScopes = Object.fromEntries(
  appConfig.channelEntityTypes
    .filter((channelType) => channelType !== 'organization')
    .map((channelType) => [appConfig.entityIdColumnKeys[channelType], null]),
);

// Covers the attachment notification source, the template consumer of the notifications contract:
// the write ops dispatch onto the mutation bus, the fan-out turns an activity event into inbox rows
// for the uploader (never the actor), and the instant email path honours the per-type preference.
describe('Attachment notifications (template notification source)', async () => {
  const call = await createAppClient();
  let tenant: TestTenant;
  let member: { id: string; sessionCookie: string };
  let plan: TestEntityHierarchyPlan;
  const dispatched: MutationPayload[] = [];

  const updatedEvent = (subjectId: string, actorId: string, activityId: string): ActivityEvent =>
    // Test mock: the CDC worker fills the remaining columns; the fan-out reads only these.
    ({
      id: activityId,
      type: 'attachment.updated',
      action: 'update',
      entityType: 'attachment',
      resourceType: null,
      tableName: 'attachments',
      subjectId,
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
      changedFields: ['name'],
    }) as unknown as ActivityEvent;

  const notificationsFor = (userId: string, subjectId: string) =>
    db
      .select({ type: notificationsTable.type, emailedAt: notificationsTable.emailedAt })
      .from(notificationsTable)
      .where(and(eq(notificationsTable.userId, userId), eq(notificationsTable.subjectId, subjectId)));

  beforeAll(async () => {
    mockFetchRequest();
    tenant = await createTestTenant(call, 'attachment-notifications');
    member = await createOrgUser(call, tenant.tenantId, tenant.organization.id, 'attachment-notifications-member');

    plan = buildTestEntityHierarchyPlan({
      entityType: 'attachment',
      rootChannelId: tenant.organization.id,
      makeChannelId: () => generateId(),
    });
    await seedEntityHierarchy(db, plan, {
      tenantId: tenant.tenantId,
      createdBy: tenant.user.id,
      slugPrefix: 'attachment-notifications',
    });

    const row = (id: string, createdBy: string) =>
      buildInsertableProduct(
        'attachment',
        {
          id,
          tenantId: tenant.tenantId,
          ...plan.channelIdColumns,
          createdBy,
          updatedBy: null,
          deletedBy: null,
        },
        id,
      );
    for (const values of [row(memberUpload, member.id), row(adminUpload, tenant.user.id)]) {
      // buildInsertableProduct returns a config-derived Record, so the insert type needs a cast.
      await db.insert(attachmentsTable).values(values as typeof attachmentsTable.$inferInsert);
    }

    registerMutationHandler('attachment.updated', async (_ctx, payload) => {
      dispatched.push(payload);
    });
  });

  afterAll(async () => {
    await db.delete(notificationsTable).where(inArray(notificationsTable.subjectId, [memberUpload, adminUpload]));
    await db.delete(notificationPreferencesTable).where(eq(notificationPreferencesTable.userId, tenant.user.id));
    await db.delete(attachmentsTable).where(inArray(attachmentsTable.id, [memberUpload, adminUpload]));
    await cleanupEntityHierarchy(db, plan);
    await clearSecurityTestData();
  });

  it('dispatches attachment.updated inside the write, before and after index-aligned', async () => {
    const result = await call(updateAttachment, {
      path: { organizationId: tenant.organization.id, tenantId: tenant.tenantId, id: memberUpload },
      body: { ops: { name: 'renamed by admin' }, stx: updateStx() },
      headers: { ...defaultHeaders, Cookie: tenant.sessionCookie },
    });
    expect(result.response.status).toBe(200);

    expect(dispatched).toHaveLength(1);
    const [payload] = dispatched;
    expect(payload.before?.[0]?.id).toBe(memberUpload);
    expect(payload.after?.[0]).toMatchObject({ id: memberUpload, name: 'renamed by admin' });
  });

  it('fans out an edit by someone else to the uploader, never to the actor', async () => {
    await fanOutNotifications(updatedEvent(adminUpload, tenant.user.id, `act:${generateId()}`));
    expect(await notificationsFor(tenant.user.id, adminUpload)).toEqual([]);

    await fanOutNotifications(updatedEvent(adminUpload, member.id, `act:${generateId()}`));
    expect(await notificationsFor(tenant.user.id, adminUpload)).toEqual([{ type: 'edit', emailedAt: null }]);
  });

  it('emails instantly only once the recipient turns the type email preference on', async () => {
    const dbCtx = { var: { db } };
    await findOrCreatePreferences(dbCtx, tenant.user.id);

    await sendPendingInstantEmails(tenant.organization.id);
    expect((await notificationsFor(tenant.user.id, adminUpload))[0]?.emailedAt).toBeNull();

    await updatePreferences(dbCtx, tenant.user.id, { editEmail: true });
    await sendPendingInstantEmails(tenant.organization.id);
    expect((await notificationsFor(tenant.user.id, adminUpload))[0]?.emailedAt).not.toBeNull();
  });
});
