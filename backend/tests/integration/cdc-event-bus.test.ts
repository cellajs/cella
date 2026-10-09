import { eq, inArray, sql } from 'drizzle-orm';
import type { TestEntityHierarchyPlan } from 'shared/testing/entity-hierarchy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { type ActivityEvent, activityBus } from '#/lib/activity-bus';
import { buildInsertableProduct } from '#/mocks';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { channelCountersTable } from '#/modules/entities/channel-counters-db';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { mockChannelMembership } from '#/modules/memberships/memberships-mocks';
import { organizationsTable } from '#/modules/organization/organization-db';
import { mockOrganization } from '#/modules/organization/organization-mocks';
import { tenantsTable } from '#/modules/tenants/tenants-db';
import { emailsTable } from '#/modules/user/emails-db';
import { mockUser } from '#/modules/user/user-mocks';
import { insertUsers } from '#/modules/user/user-queries';
import { memberRole } from '../fixtures';
import { cleanupEntityHierarchy, seedAttachmentHome } from '../hierarchy-helpers';
import { clearDatabase, startInProcessCdcWorker, waitFor, waitForEvent } from './test-utils';

/** The full DB change to CDC worker to WebSocket path, with the worker pipeline in-process so `pnpm test` needs no separate worker. */
describe.skipIf(process.env.TEST_MODE !== 'full')('Full CDC Flow', () => {
  let cdcHarness: Awaited<ReturnType<typeof startInProcessCdcWorker>>;
  let testOrg: { id: string; slug: string; tenantId: string };
  let testUser: { id: string; email: string };
  let plan: TestEntityHierarchyPlan;

  beforeAll(async () => {
    cdcHarness = await startInProcessCdcWorker();
    await clearDatabase();

    // Orgs require the tenant FK.
    const [tenant] = await db.insert(tenantsTable).values({ name: 'Test Tenant' }).returning({ id: tenantsTable.id });

    const orgData = mockOrganization();
    [testOrg] = await db
      .insert(organizationsTable)
      .values({ ...orgData, tenantId: tenant.id })
      .returning({ id: organizationsTable.id, slug: organizationsTable.slug, tenantId: organizationsTable.tenantId });

    const userData = mockUser();
    const [insertedUser] = await insertUsers({ var: { db } }, { users: [userData] });
    testUser = { id: insertedUser.id, email: insertedUser.email };
    await db.insert(emailsTable).values({ email: testUser.email, userId: testUser.id, verifiedAt: new Date().toISOString() });

    // Strict sub-organization ancestor columns carry foreign keys, so their rows must exist.
    plan = await seedAttachmentHome(testOrg, testUser.id);
  });

  const readCounts = async () => {
    const [row] = await db
      .select({ counts: channelCountersTable.counts })
      .from(channelCountersTable)
      .where(eq(channelCountersTable.channelKey, testOrg.id));
    return (row?.counts ?? {}) as Record<string, number>;
  };

  afterAll(async () => {
    await cdcHarness?.stop();
    await cleanupEntityHierarchy(db, plan);
    await clearDatabase();
  });

  it('should emit membership.created when membership is inserted', async () => {
    const eventPromise = waitForEvent('membership.created', 15000);

    const membershipData = mockChannelMembership('organization', testOrg, testUser);
    await db.insert(membershipsTable).values(membershipData);

    const event = await eventPromise;

    expect(event.type).toBe('membership.created');
    expect(event.resourceType).toBe('membership');
    expect(event.subjectId).toBe(membershipData.id);
    expect(event.rowData).toMatchObject({ channelType: 'organization', channelId: testOrg.id, organizationId: testOrg.id });
    // The activity names its organization: without it the stream listener has nowhere to route the event.
    expect(event.organizationId).toBe(testOrg.id);
    // And the organization's bump-only signal moves, which is what a catchup screens membership changes with.
    await waitFor(async () => ((await readCounts()).membership ?? 0) >= 1, 15_000, 'membership signal on channel_counters');
  });

  it('must not hand two memberships removed in one transaction to the API as one event', async () => {
    const members = await insertUsers({ var: { db } }, { users: [mockUser(), mockUser()] });
    // Members, whatever role the mock draws: the database refuses a delete that takes the organization's last admin.
    const memberships = members.map((member) => ({ ...mockChannelMembership('organization', testOrg, member), role: memberRole }));
    await db.insert(membershipsTable).values(memberships);
    const membershipIds = memberships.map((membership) => membership.id as string);
    const signalBefore = async () => (await readCounts()).membership ?? 0;
    await waitFor(async () => (await readCounts())['m:c:total'] === 3, 15_000, 'both memberships counted');
    const before = await signalBefore();

    const removed: { subjectId: string | null; organizationId: string | null; userId: unknown }[] = [];
    activityBus.on('membership.deleted', (event) => {
      removed.push({
        subjectId: event.subjectId,
        organizationId: event.organizationId ?? null,
        userId: (event.rowData as { userId?: string } | null)?.userId,
      });
    });

    await db.delete(membershipsTable).where(inArray(membershipsTable.id, membershipIds));

    await waitFor(() => removed.length >= 2, 15_000, 'an event for each removed membership');
    // One event per row, each with its own user: a listener that acts on one row acts on both.
    expect(removed.map((event) => event.subjectId).sort()).toEqual([...membershipIds].sort());
    expect(removed.map((event) => event.userId).sort()).toEqual(members.map((member) => member.id).sort());
    expect(removed.every((event) => event.organizationId === testOrg.id)).toBe(true);
    await waitFor(async () => (await signalBefore()) >= before + 2, 15_000, 'membership signal moved for both');
  });

  it('hands a created attachment to the API as a list of one row, with its permission fields, its seq and no content', async () => {
    const attachmentId = crypto.randomUUID();
    const attachment = buildInsertableProduct(
      'attachment',
      {
        id: attachmentId,
        tenantId: testOrg.tenantId,
        ...plan.channelIdColumns,
        createdBy: testUser.id,
        updatedBy: testUser.id,
        seq: 0,
        name: 'cdc-rows-test-name',
      },
      'cdc-rows-test-attachment',
    );
    const created: ActivityEvent[] = [];
    const listener = (event: ActivityEvent) => void (event.subjectId === attachmentId && created.push(event));
    activityBus.on('attachment.created', listener);

    await db.insert(attachmentsTable).values(attachment as never);
    await waitFor(() => created.length >= 1, 15_000, 'the event of the created attachment');
    activityBus.off('attachment.created', listener);

    const [stored] = await db.select({ seq: attachmentsTable.seq }).from(attachmentsTable).where(eq(attachmentsTable.id, attachmentId));
    const [event] = created;
    // One row, with the seq the worker stamped on it: the API gives its notification that seq and no range.
    expect(event.rows).toHaveLength(1);
    expect(event.rows?.[0].seq).toBe(stored.seq);
    expect(stored.seq).toBeGreaterThan(0);
    // What decides who may read the row travels; its name and its file do not, and no whole row comes beside the list.
    expect(event.rows?.[0].rowData).toMatchObject({ id: attachmentId, createdBy: testUser.id, ...plan.channelIdColumns });
    expect(event.rows?.[0].rowData).not.toHaveProperty('name');
    expect(JSON.stringify(event)).not.toContain('cdc-rows-test-name');
    expect(event.rowData).toBeNull();
    expect(event.organizationId).toBe(testOrg.id);
  });

  it("must not leave a runtime-created organization's counters row without its path", async () => {
    // The generated `path` column never reaches the row image, so the worker computes it: catchup verifies prefixes with it.
    const readPath = async () => {
      const [row] = await db
        .select({ path: channelCountersTable.path })
        .from(channelCountersTable)
        .where(eq(channelCountersTable.channelKey, testOrg.id));
      return row?.path ?? null;
    };
    await waitFor(async () => (await readPath()) === testOrg.id, 15_000, 'organization path on channel_counters');
  });

  it('should stamp attachments.seq and bump channel_counters.f:attachment on UPDATE', async () => {
    const attachmentId = crypto.randomUUID();
    const attachment = buildInsertableProduct(
      'attachment',
      { id: attachmentId, tenantId: testOrg.tenantId, ...plan.channelIdColumns, createdBy: testUser.id, updatedBy: testUser.id, seq: 0 },
      'cdc-seq-test-attachment',
    );
    await db.insert(attachmentsTable).values(attachment as never);

    const counterKey = sql`${testOrg.id}::varchar`;
    // f:attachment is the attachment frontier: it advances by 1 per stamp and equals that row's seq.
    const readCounter = async () => {
      const [row] = await db
        .select({ s: sql<number>`(${channelCountersTable.counts}->>'e:f:attachment')::int` })
        .from(channelCountersTable)
        .where(eq(channelCountersTable.channelKey, counterKey));
      return row?.s ?? 0;
    };
    const readAttachment = async () => {
      const [row] = await db
        .select({ seq: attachmentsTable.seq, stx: attachmentsTable.stx })
        .from(attachmentsTable)
        .where(eq(attachmentsTable.id, attachmentId));
      return row;
    };

    let inserted: Awaited<ReturnType<typeof readAttachment>> | undefined;
    await waitFor(
      async () => {
        inserted = await readAttachment();
        const counter = await readCounter();
        return !!inserted && inserted.seq > 0 && counter > 0;
      },
      15_000,
      'CDC insert stamp on attachment',
    );

    const beforeCounter = await readCounter();
    const beforeSeq = inserted!.seq;

    // CDC only processes an update that sets stx.changedFields.
    await db.execute(sql`
      UPDATE attachments
      SET name = 'cdc-seq-test-updated',
          stx = jsonb_set(stx, '{changedFields}', '["summary","updatedAt"]'::jsonb)
      WHERE id = ${attachmentId}
    `);

    let stamped: Awaited<ReturnType<typeof readAttachment>> | undefined;
    await waitFor(
      async () => {
        stamped = await readAttachment();
        return !!stamped && stamped.seq > beforeSeq;
      },
      15_000,
      'CDC seq stamp on attachment update',
    );

    expect(stamped, 'attachment row should exist').toBeDefined();
    expect(stamped!.seq, 'seq should be stamped by CDC').toBeGreaterThan(0);

    const afterCounter = await readCounter();
    expect(afterCounter, 'organization f:attachment frontier should advance').toBe(beforeCounter + 1);
    expect(stamped!.seq, 'attachment.seq should equal new f:attachment frontier').toBe(afterCounter);

    const stx = stamped!.stx as { changedFields?: unknown } | null;
    expect(stx?.changedFields, 'stx.changedFields should be removed').toBeUndefined();
  });
});
