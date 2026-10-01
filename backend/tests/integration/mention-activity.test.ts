import { and, eq } from 'drizzle-orm';
import { updateAttachment } from 'sdk';
import type { TestEntityHierarchyPlan } from 'shared/testing/entity-hierarchy';
import { generateId } from 'shared/utils/entity-id';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateServerHLC } from '#/core/stx';
import { getSeedDb } from '#/db/db';
import { buildInsertableProduct } from '#/mocks';
import { activitiesTable } from '#/modules/activities/activities-db';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { notificationsTable } from '#/modules/notification/notification-db';
import { mockStxBase } from '#/schemas/sync-transaction-mocks';
import { adminRole, defaultHeaders } from '../fixtures';
import { cleanupEntityHierarchy, insertAttachmentRow, seedAttachmentHome } from '../hierarchy-helpers';
import { clearSecurityTestData, createOrgUser, createTestTenant, type TestTenant } from '../security/helpers';
import { createAppClient } from '../test-client';
import { startInProcessCdcWorker, waitFor } from './test-utils';

const db = getSeedDb();

const attachmentId = generateId();

const mentionDocument = (userId: string) =>
  JSON.stringify([
    {
      id: generateId(),
      type: 'paragraph',
      props: {},
      content: [{ type: 'mention', props: { id: userId, name: 'someone', slug: 'someone' } }],
      children: [],
    },
  ]);

/**
 * A mention edit through the CDC worker: the activity log is what sync and the notification
 * fan-out consume, so one client edit must stay one `updated` activity attributed to the edit,
 * and the fan-out reads the mention from the body that activity carries.
 */
describe.skipIf(process.env.TEST_MODE !== 'full')('Mention edit activity', async () => {
  const call = await createAppClient();
  let cdcHarness: Awaited<ReturnType<typeof startInProcessCdcWorker>>;
  let tenant: TestTenant;
  let member: { id: string };
  let plan: TestEntityHierarchyPlan;

  const updateActivities = () =>
    db
      .select({ changedFields: activitiesTable.changedFields })
      .from(activitiesTable)
      .where(and(eq(activitiesTable.subjectId, attachmentId), eq(activitiesTable.action, 'update')))
      .orderBy(activitiesTable.id);

  const memberInbox = () =>
    db
      .select({ type: notificationsTable.type })
      .from(notificationsTable)
      .where(and(eq(notificationsTable.userId, member.id), eq(notificationsTable.subjectId, attachmentId)));

  beforeAll(async () => {
    cdcHarness = await startInProcessCdcWorker();
    tenant = await createTestTenant(call, 'mention-activity');
    member = await createOrgUser(call, tenant.tenantId, tenant.organization.id, 'mention-activity-member', adminRole);
    plan = await seedAttachmentHome({ id: tenant.organization.id, tenantId: tenant.tenantId }, tenant.user.id);

    const row = buildInsertableProduct(
      'attachment',
      {
        id: attachmentId,
        tenantId: tenant.tenantId,
        ...plan.channelIdColumns,
        createdBy: tenant.user.id,
        updatedBy: null,
      },
      attachmentId,
    );
    await insertAttachmentRow({ ...row, deletedBy: null });

    // The insert's seq stamp marks the worker as caught up with the row.
    await waitFor(
      async () => {
        const [stamped] = await db
          .select({ seq: attachmentsTable.seq })
          .from(attachmentsTable)
          .where(eq(attachmentsTable.id, attachmentId));
        return (stamped?.seq ?? 0) > 0;
      },
      15_000,
      'CDC insert stamp on the attachment',
    );
  });

  afterAll(async () => {
    await cdcHarness?.stop();
    await db.delete(notificationsTable).where(eq(notificationsTable.subjectId, attachmentId));
    await db.delete(attachmentsTable).where(eq(attachmentsTable.id, attachmentId));
    await cleanupEntityHierarchy(db, plan);
    await clearSecurityTestData();
  });

  it('stores an edit that adds a mention as one updated activity and mentions the member', async () => {
    const result = await call(updateAttachment, {
      path: { organizationId: tenant.organization.id, tenantId: tenant.tenantId, id: attachmentId },
      body: {
        ops: { description: mentionDocument(member.id) },
        stx: { ...mockStxBase(`stx:${generateId()}`), fieldTimestamps: { description: generateServerHLC('test') } },
      },
      headers: { ...defaultHeaders, Cookie: tenant.sessionCookie },
    });
    expect(result.response.status).toBe(200);

    // The fan-out runs after the activity is persisted; writes of one transaction are persisted in one insert.
    await waitFor(async () => (await memberInbox()).length > 0, 15_000, 'mention notification for the member');

    const activities = await updateActivities();
    expect(activities.map(({ changedFields }) => changedFields)).toEqual([['description', 'updatedAt']]);
    // Every integration file runs its own CDC worker on the one WAL, so a parallel run can fan this row
    // out more than once (a late create fan-out reads the edited body too); each row is a mention.
    expect(new Set((await memberInbox()).map(({ type }) => type))).toEqual(new Set(['mention']));
  });
});
