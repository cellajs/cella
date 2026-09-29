import { eq, sql } from 'drizzle-orm';
import type { TestEntityHierarchyPlan } from 'shared/testing/entity-hierarchy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { buildInsertableProduct } from '#/mocks';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { channelCountersTable } from '#/modules/entities/channel-counters-db';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { mockChannelMembership } from '#/modules/memberships/memberships-mocks';
import { organizationsTable } from '#/modules/organization/organization-db';
import { mockOrganization } from '#/modules/organization/organization-mocks';
import { tenantsTable } from '#/modules/tenants/tenants-db';
import { emailsTable } from '#/modules/user/emails-db';
import { insertUsers } from '#/modules/user/helpers/insert-users';
import { mockUser } from '#/modules/user/user-mocks';
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
    const [insertedUser] = await insertUsers(db, [userData]);
    testUser = { id: insertedUser.id, email: insertedUser.email };
    await db.insert(emailsTable).values({ email: testUser.email, userId: testUser.id, verified: true });

    // Strict sub-organization ancestor columns carry foreign keys, so their rows must exist.
    plan = await seedAttachmentHome(testOrg, testUser.id);
  });

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
    expect(event.rowData).toMatchObject({
      channelType: 'organization',
      channelId: testOrg.id,
      organizationId: testOrg.id,
    });
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
      {
        id: attachmentId,
        tenantId: testOrg.tenantId,
        ...plan.channelIdColumns,
        createdBy: testUser.id,
        updatedBy: testUser.id,
        seq: 0,
      },
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
