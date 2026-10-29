import { and, count, eq, isNull } from 'drizzle-orm';
import { createAttachments } from 'sdk';
import { appConfig } from 'shared';
import type { TestEntityHierarchyPlan } from 'shared/testing/entity-hierarchy';
import { generateId } from 'shared/utils/entity-id';
import { afterAll, beforeAll, describe, expect, it, onTestFinished } from 'vitest';
import { baseDb as db } from '#/db/db';
import { dropCachedTenant } from '#/middlewares/guard/tenant-cache';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { tenantsTable } from '#/modules/tenants/tenants-db';
import { defaultHeaders, memberRole } from '../fixtures';
import { adminDb, createTestOrganization, expectRefusal } from '../helpers';
import { attachmentBody, cleanupEntityHierarchy, joinAttachmentHome, seedAttachmentHome } from '../hierarchy-helpers';
import { createAppClient } from '../test-client';
import { setTestConfig } from '../test-utils';
import { clearSecurityTestData, createOrgUser } from './helpers';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

type Created = { data: { id: string; createdBy: { id: string } | null }[]; rejectedIds: string[] };

/**
 * A create names its rows by client-chosen ids, and a replay answers with the rows the first attempt wrote, before the
 * CDC worker has seen them (the suite runs without it). Row ids and mutation ids travel in sync payloads, so another
 * member can learn them: a replay by them must never return someone else's rows.
 */
describe('Idempotent attachment creates', async () => {
  const call = await createAppClient();
  let organization: { id: string; tenantId: string };
  let plan: TestEntityHierarchyPlan;
  /** An organization in another tenant that the owner is a member of too. */
  let elsewhere: { id: string; tenantId: string };
  let planElsewhere: TestEntityHierarchyPlan;
  let owner: { id: string; sessionCookie: string };
  let other: { id: string; sessionCookie: string };

  /** A create body for an upload in `home`, sent as the sync mutation `mutationId`. */
  const bodyFor = (id: string, mutationId: string, home = plan) =>
    attachmentBody(id, home, {
      bucketName: appConfig.s3.privateBucket,
      stx: { mutationId, sourceId: 'idempotency-test', fieldTimestamps: {} },
    });

  const create = async (
    as: { sessionCookie: string },
    body: ReturnType<typeof bodyFor> | ReturnType<typeof bodyFor>[],
    home: { id: string; tenantId: string } = organization,
  ) => {
    const { data, error, response } = await call(createAttachments, {
      path: { tenantId: home.tenantId, organizationId: home.id },
      body: (Array.isArray(body) ? body : [body]) as never,
      headers: { ...defaultHeaders, Cookie: as.sessionCookie },
    });
    const created = data as Created | undefined;
    return { status: response.status, body: error, data: created?.data ?? [], rejectedIds: created?.rejectedIds ?? [] };
  };

  const storedRow = async (id: string) => (await adminDb.select().from(attachmentsTable).where(eq(attachmentsTable.id, id)))[0];

  const liveAttachments = async () => {
    const [{ total }] = await adminDb
      .select({ total: count() })
      .from(attachmentsTable)
      .where(and(eq(attachmentsTable.tenantId, organization.tenantId), isNull(attachmentsTable.deletedAt)));
    return total;
  };

  /** Sets the tenant's attachment quota for the rest of the test. */
  const limitAttachments = async (quota: number) => {
    const { tenantId } = organization;
    const [tenant] = await adminDb.select().from(tenantsTable).where(eq(tenantsTable.id, tenantId));
    const setRestrictions = async (restrictions: typeof tenant.restrictions) => {
      await adminDb.update(tenantsTable).set({ restrictions }).where(eq(tenantsTable.id, tenantId));
      dropCachedTenant(tenantId);
    };
    onTestFinished(() => setRestrictions(tenant.restrictions));
    await setRestrictions({ ...tenant.restrictions, quotas: { ...tenant.restrictions.quotas, attachment: quota } });
  };

  beforeAll(async () => {
    organization = await createTestOrganization();
    owner = await createOrgUser(call, organization.tenantId, organization.id, 'idempotency-owner');
    other = await createOrgUser(call, organization.tenantId, organization.id, 'idempotency-other');
    plan = await seedAttachmentHome(organization, owner.id);
    for (const user of [owner, other]) await joinAttachmentHome(organization, plan, user.id);

    elsewhere = await createTestOrganization();
    planElsewhere = await seedAttachmentHome(elsewhere, owner.id);
    await joinAttachmentHome(elsewhere, planElsewhere, owner.id);
    await db.insert(membershipsTable).values({
      id: generateId(),
      userId: owner.id,
      channelId: elsewhere.id,
      organizationId: elsewhere.id,
      tenantId: elsewhere.tenantId,
      channelType: 'organization',
      role: memberRole,
      displayOrder: 2,
      createdBy: owner.id,
    });
  });

  afterAll(async () => {
    for (const { tenantId } of [organization, elsewhere]) {
      await adminDb.delete(attachmentsTable).where(eq(attachmentsTable.tenantId, tenantId));
    }
    await cleanupEntityHierarchy(adminDb, plan, planElsewhere);
    await clearSecurityTestData();
  });

  it("must not return another member's attachment via a replayed mutation id", async () => {
    const mutationId = generateId();
    const ownersId = generateId();
    expect((await create(owner, bodyFor(ownersId, mutationId))).status).toBe(201);

    const replayedId = generateId();
    const { status, data } = await create(other, bodyFor(replayedId, mutationId));
    expect(status).toBe(201);
    expect(data.map((row) => row.id)).toEqual([replayedId]);
    expect(data[0]?.createdBy?.id).toBe(other.id);
    expect((await storedRow(replayedId))?.createdBy).toBe(other.id);
    expect((await storedRow(ownersId))?.createdBy).toBe(owner.id);
  });

  it("must not return another member's attachment via its id", async () => {
    const ownersId = generateId();
    expect((await create(owner, bodyFor(ownersId, generateId()))).status).toBe(201);

    // The id is refused as any taken id is: nothing created, nothing of the row returned.
    const { status, data, rejectedIds } = await create(other, bodyFor(ownersId, generateId()));
    expect(status).toBe(200);
    expect(data).toEqual([]);
    expect(rejectedIds).toEqual([ownersId]);
    expect((await storedRow(ownersId))?.createdBy).toBe(owner.id);
  });

  it("must not answer a replay on another tenant's path with the caller's rows from this one", async () => {
    const mutationId = generateId();
    const hereId = generateId();
    expect((await create(owner, bodyFor(hereId, mutationId))).status).toBe(201);

    // The same user sends the same row in the other tenant they belong to: nothing of this tenant comes back.
    const { data } = await create(owner, bodyFor(hereId, mutationId, planElsewhere), elsewhere);
    expect(data).toEqual([]);
    expect(await storedRow(hereId)).toMatchObject({ tenantId: organization.tenantId, organizationId: organization.id });
  });

  it("answers a replay of the caller's own create with its rows before the CDC worker saw them (positive control)", async () => {
    const id = generateId();
    const body = bodyFor(id, generateId());
    expect((await create(owner, body)).status).toBe(201);

    // The row exists already, so only the replay check can hand it back: 200, since this request created nothing.
    const { status, data } = await create(owner, body);
    expect(status).toBe(200);
    expect(data.map((row) => row.id)).toEqual([id]);
  });

  it('creates the new rows of a batch that repeats a row it already wrote', async () => {
    const first = generateId();
    expect((await create(owner, bodyFor(first, generateId()))).status).toBe(201);

    // A retry that adds a file, under a new mutation id: the repeated row comes back, the new one is created.
    const second = generateId();
    const { status, data } = await create(owner, [bodyFor(first, generateId()), bodyFor(second, generateId())]);
    expect(status).toBe(201);
    expect(data.map((row) => row.id).sort()).toEqual([first, second].sort());
    expect((await storedRow(second))?.createdBy).toBe(owner.id);
  });

  it('answers two attempts of one create sent at the same time with its row', async () => {
    const id = generateId();
    const body = bodyFor(id, generateId());

    const answers = await Promise.all([create(owner, body), create(owner, body)]);
    for (const { data } of answers) expect(data.map((row) => row.id)).toEqual([id]);
  });

  it('answers a replay of an edited row with its current state', async () => {
    const id = generateId();
    const body = bodyFor(id, generateId());
    expect((await create(owner, body)).status).toBe(201);
    // An edit stamps the row with its own mutation id, so a lookup by the create's mutation id would miss the row.
    await adminDb
      .update(attachmentsTable)
      .set({ name: 'Edited', stx: { mutationId: generateId(), sourceId: 'idempotency-test', fieldTimestamps: {} } })
      .where(eq(attachmentsTable.id, id));

    const { status, data } = await create(owner, body);
    expect(status).toBe(200);
    expect(data).toMatchObject([{ id, name: 'Edited' }]);
  });

  it('must not bring a deleted row back via a replay of its create', async () => {
    const id = generateId();
    const body = bodyFor(id, generateId());
    expect((await create(owner, body)).status).toBe(201);
    await adminDb.update(attachmentsTable).set({ deletedAt: new Date().toISOString(), deletedBy: owner.id }).where(eq(attachmentsTable.id, id));

    const { status, data, rejectedIds } = await create(owner, body);
    expect(status).toBe(200);
    expect(data).toEqual([]);
    expect(rejectedIds).toEqual([id]);
    expect((await storedRow(id))?.deletedAt).not.toBeNull();
  });

  it('refuses a create past the tenant quota with 403 restrict_by_app, and still answers a replay of rows it wrote', async () => {
    const body = bodyFor(generateId(), generateId());
    expect((await create(owner, body)).status).toBe(201);
    // The stored row counts before the CDC worker (absent here) has counted it: 1 stored and 2 more pass a quota of 2.
    await limitAttachments(2);

    const overQuota = await call(createAttachments, {
      path: { tenantId: organization.tenantId, organizationId: organization.id },
      body: [bodyFor(generateId(), generateId()), bodyFor(generateId(), generateId())] as never,
      headers: { ...defaultHeaders, Cookie: owner.sessionCookie },
    });
    await expectRefusal(overQuota, 403, 'restrict_by_app');

    // Positive control: a replay creates nothing, so the full quota lets it through.
    expect((await create(owner, body)).status).toBe(200);
  });

  it('must not let concurrent creates exceed the tenant quota', async () => {
    const held = await liveAttachments();
    await limitAttachments(held + 1);

    // One member's ten creates race for the one free slot: each counts the rows the others committed.
    const answers = await Promise.all(Array.from({ length: 10 }, () => create(owner, bodyFor(generateId(), generateId()))));
    expect(answers.filter(({ status }) => status === 201)).toHaveLength(1);
    for (const answer of answers.filter(({ status }) => status !== 201)) await expectRefusal(answer, 403, 'restrict_by_app');
    expect(await liveAttachments()).toBe(held + 1);
  });

  it('answers two attempts of one create at the last free slot with its row (positive control)', async () => {
    await limitAttachments((await liveAttachments()) + 1);
    const id = generateId();
    const body = bodyFor(id, generateId());

    const answers = await Promise.all([create(owner, body), create(owner, body)]);
    for (const { data } of answers) expect(data.map((row) => row.id)).toEqual([id]);
  });

  it('answers a replay of a batch larger than the tenant quota with its rows', async () => {
    const batch = [bodyFor(generateId(), generateId()), bodyFor(generateId(), generateId())];
    expect((await create(owner, batch)).status).toBe(201);
    await limitAttachments(1);

    // The batch outgrew the quota after it was written; its replay creates nothing, so no quota applies.
    const { status, data } = await create(owner, batch);
    expect(status).toBe(200);
    expect(data.map((row) => row.id).sort()).toEqual(batch.map((item) => item.id).sort());
  });
});
