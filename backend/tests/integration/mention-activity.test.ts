import { and, eq, inArray, sql } from 'drizzle-orm';
import { updateAttachment } from 'sdk';
import type { TestEntityHierarchyPlan } from 'shared/testing/entity-hierarchy';
import { generateId } from 'shared/utils/entity-id';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ActorContext } from '#/core/context';
import { generateServerHLC } from '#/core/stx';
import { getSeedDb } from '#/db/db';
import { buildInsertableProduct } from '#/mocks';
import { activitiesTable } from '#/modules/activities/activities-db';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { notificationsTable } from '#/modules/notification/notification-db';
import { getNotificationSource } from '#/modules/notification/notification-sources';
import { deriveMentions } from '#/modules/notification/operations/derive-mentions';
import { mockStxBase } from '#/schemas/sync-transaction-mocks';
import { adminRole, defaultHeaders } from '../fixtures';
import { cleanupEntityHierarchy, insertAttachmentRow, seedAttachmentHome } from '../hierarchy-helpers';
import { clearSecurityTestData, createOrgUser, createTestTenant, type TestTenant } from '../security/helpers';
import { createAppClient } from '../test-client';
import { startInProcessCdcWorker, waitFor } from './test-utils';

const db = getSeedDb();

/** Edited through the update op, which prepares the mentions into its own statement. */
const preparedId = generateId();
/** Edited by hand and derived after the write, as an op without `prepareMutation` does. */
const unpreparedId = generateId();

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
 * Mention derivation through the CDC worker: the activity log is what sync and the notification
 * fan-out consume, so one client edit must stay one `updated` activity attributed to the edit.
 */
describe.skipIf(process.env.TEST_MODE !== 'full')('Mention derivation activity', async () => {
  const call = await createAppClient();
  let cdcHarness: Awaited<ReturnType<typeof startInProcessCdcWorker>>;
  let tenant: TestTenant;
  let member: { id: string };
  let plan: TestEntityHierarchyPlan;

  const updateActivities = (subjectId: string) =>
    db
      .select({ changedFields: activitiesTable.changedFields })
      .from(activitiesTable)
      .where(and(eq(activitiesTable.subjectId, subjectId), eq(activitiesTable.action, 'update')))
      .orderBy(activitiesTable.id);

  const storedMentions = async (id: string) => {
    const [row] = await db
      .select({ mentions: attachmentsTable.mentions })
      .from(attachmentsTable)
      .where(eq(attachmentsTable.id, id));
    return row.mentions;
  };

  beforeAll(async () => {
    cdcHarness = await startInProcessCdcWorker();
    tenant = await createTestTenant(call, 'mention-activity');
    member = await createOrgUser(call, tenant.tenantId, tenant.organization.id, 'mention-activity-member', adminRole);
    plan = await seedAttachmentHome({ id: tenant.organization.id, tenantId: tenant.tenantId }, tenant.user.id);

    for (const id of [preparedId, unpreparedId]) {
      const row = buildInsertableProduct(
        'attachment',
        { id, tenantId: tenant.tenantId, ...plan.channelIdColumns, createdBy: tenant.user.id, updatedBy: null },
        id,
      );
      await insertAttachmentRow({ ...row, deletedBy: null, mentions: [] });
    }

    // The inserts' seq stamps mark the worker as caught up with the rows.
    await waitFor(
      async () => {
        const stamped = await db
          .select({ seq: attachmentsTable.seq })
          .from(attachmentsTable)
          .where(inArray(attachmentsTable.id, [preparedId, unpreparedId]));
        return stamped.length === 2 && stamped.every(({ seq }) => seq > 0);
      },
      15_000,
      'CDC insert stamps on attachments',
    );
  });

  afterAll(async () => {
    await cdcHarness?.stop();
    await db.delete(notificationsTable).where(inArray(notificationsTable.subjectId, [preparedId, unpreparedId]));
    await db.delete(attachmentsTable).where(inArray(attachmentsTable.id, [preparedId, unpreparedId]));
    await cleanupEntityHierarchy(db, plan);
    await clearSecurityTestData();
  });

  it('writes a derived mention in the edit itself: one updated activity, attributed to the edit', async () => {
    const result = await call(updateAttachment, {
      path: { organizationId: tenant.organization.id, tenantId: tenant.tenantId, id: preparedId },
      body: {
        ops: { description: mentionDocument(member.id) },
        stx: { ...mockStxBase(`stx:${generateId()}`), fieldTimestamps: { description: generateServerHLC('test') } },
      },
      headers: { ...defaultHeaders, Cookie: tenant.sessionCookie },
    });
    expect(result.response.status).toBe(200);

    // Writes of one transaction reach the worker together and are persisted in one insert.
    await waitFor(async () => (await updateActivities(preparedId)).length > 0, 15_000, 'attachment updated activity');

    expect(await storedMentions(preparedId)).toEqual([member.id]);
    const activities = await updateActivities(preparedId);
    expect(activities.map(({ changedFields }) => changedFields)).toEqual([['description', 'updatedAt']]);
  });

  it('attributes a mention update after an unprepared write to the mentions column', async () => {
    const source = getNotificationSource('attachment');
    if (!source) throw new Error('attachment notification source not registered');

    await db.transaction(async (tx) => {
      const [before] = await tx.select().from(attachmentsTable).where(eq(attachmentsTable.id, unpreparedId));
      // The client edit as an op stores it: its changed fields recorded in stx.
      const [after] = await tx
        .update(attachmentsTable)
        .set({
          description: mentionDocument(member.id),
          stx: sql`jsonb_set(${attachmentsTable.stx}, '{changedFields}', '["description","updatedAt"]'::jsonb)`,
        })
        .where(eq(attachmentsTable.id, unpreparedId))
        .returning();
      // Test mock: derivation reads only `var.db`, here the writing transaction.
      const ctx = { var: { db: tx } } as unknown as ActorContext;
      await deriveMentions(ctx, { before: [before], after: [after] }, source);
    });

    await waitFor(async () => (await updateActivities(unpreparedId)).length > 0, 15_000, 'attachment updated activity');

    expect(await storedMentions(unpreparedId)).toEqual([member.id]);
    // The second update is server-driven: the worker diffs it, so it does not repeat the edit's fields.
    const activities = await updateActivities(unpreparedId);
    expect(activities.map(({ changedFields }) => changedFields)).toEqual([['description', 'updatedAt'], ['mentions']]);
  });
});
