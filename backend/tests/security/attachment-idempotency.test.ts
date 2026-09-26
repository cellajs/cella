import { eq } from 'drizzle-orm';
import { createAttachments } from 'sdk';
import { appConfig, hierarchy } from 'shared';
import { buildTestEntityHierarchyPlan, type TestEntityHierarchyPlan } from 'shared/testing/entity-hierarchy';
import { generateId } from 'shared/utils/entity-id';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getAdminDb } from '#/db/db';
import { activitiesTable } from '#/modules/activities/activities-db';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { defaultHeaders } from '../fixtures';
import { createTestOrganization } from '../helpers';
import { cleanupEntityHierarchy, seedEntityHierarchy } from '../hierarchy-helpers';
import { createAppClient } from '../test-client';
import { mockFetchRequest, setTestConfig } from '../test-utils';
import { clearSecurityTestData, createOrgUser } from './helpers';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

type Created = { data: { id: string; createdBy: { id: string } | null }[] };

/**
 * A create carries a client-chosen mutation id, and a replay of a processed one answers with the rows it created. The
 * id travels in every sync payload, so another member can learn it: a replay by them must never return someone
 * else's rows.
 */
describe('Idempotent attachment creates', async () => {
  const call = await createAppClient();
  // Attachments sit under RLS and activities are read-only for runtime_role: arrange and assert as admin.
  const adminDb = getAdminDb('attachment-idempotency test');
  let organization: { id: string; tenantId: string };
  let plan: TestEntityHierarchyPlan;
  let owner: { id: string; sessionCookie: string };
  let other: { id: string; sessionCookie: string };

  /** A create body for `user`'s own upload, placed at the attachment's home channel (none in cella). */
  const bodyFor = (user: { id: string }, id: string, mutationId: string) => {
    const deepest = hierarchy
      .getOrderedAncestors('attachment')
      .find((type) => type !== 'organization' && plan.channelIdColumns[appConfig.entityIdColumnKeys[type]]);
    const placement = deepest
      ? { [appConfig.entityIdColumnKeys[deepest]]: plan.channelIdColumns[appConfig.entityIdColumnKeys[deepest]] }
      : {};
    return {
      id,
      filename: 'file.pdf',
      contentType: 'application/pdf',
      size: '1024',
      keys: { original: `${organization.id}/${user.id}/${id}.pdf` },
      bucketName: appConfig.s3.privateBucket,
      ...placement,
      stx: { mutationId, sourceId: 'idempotency-test', fieldTimestamps: {} },
    };
  };

  const create = async (as: { sessionCookie: string }, body: ReturnType<typeof bodyFor>) => {
    const { data, response } = await call(createAttachments, {
      path: { tenantId: organization.tenantId, organizationId: organization.id },
      body: [body] as never,
      headers: { ...defaultHeaders, Cookie: as.sessionCookie },
    });
    return { status: response.status, data: (data as Created | undefined)?.data ?? [] };
  };

  /** The CDC worker logs each processed write with its stx; the suite runs without it, so the test writes the row. */
  const logProcessed = (mutationId: string, attachmentId: string, userId: string) =>
    adminDb.insert(activitiesTable).values({
      id: generateId(),
      tenantId: organization.tenantId,
      organizationId: organization.id,
      userId,
      entityType: 'attachment',
      action: 'create',
      tableName: 'attachments',
      type: 'attachment.created',
      subjectId: attachmentId,
      createdAt: new Date().toISOString(),
      stx: { mutationId, sourceId: 'idempotency-test', fieldTimestamps: {} },
    });

  const storedRow = async (id: string) =>
    (await adminDb.select().from(attachmentsTable).where(eq(attachmentsTable.id, id)))[0];

  beforeAll(async () => {
    mockFetchRequest();
    organization = await createTestOrganization();
    plan = buildTestEntityHierarchyPlan({
      entityType: 'attachment',
      organizationId: organization.id,
      makeChannelId: () => generateId(),
    });
    owner = await createOrgUser(call, organization.tenantId, organization.id, 'idempotency-owner');
    other = await createOrgUser(call, organization.tenantId, organization.id, 'idempotency-other');
    await seedEntityHierarchy(adminDb, plan, {
      tenantId: organization.tenantId,
      createdBy: owner.id,
      slugPrefix: 'idempotency',
    });
  });

  afterAll(async () => {
    await adminDb.delete(attachmentsTable).where(eq(attachmentsTable.tenantId, organization.tenantId));
    await adminDb.delete(activitiesTable).where(eq(activitiesTable.tenantId, organization.tenantId));
    await cleanupEntityHierarchy(adminDb, plan);
    await clearSecurityTestData();
  });

  it("must not return another member's attachment via a replayed mutation id", async () => {
    const mutationId = generateId();
    const ownersId = generateId();
    expect((await create(owner, bodyFor(owner, ownersId, mutationId))).status).toBe(201);
    await logProcessed(mutationId, ownersId, owner.id);

    const replayedId = generateId();
    const { status, data } = await create(other, bodyFor(other, replayedId, mutationId));
    expect(status).toBe(201);
    expect(data.map((row) => row.id)).toEqual([replayedId]);
    expect(data[0]?.createdBy?.id).toBe(other.id);
    expect((await storedRow(replayedId))?.createdBy).toBe(other.id);
    expect((await storedRow(ownersId))?.createdBy).toBe(owner.id);
  });

  it("answers a replay of the caller's own mutation id with its rows (positive control)", async () => {
    const mutationId = generateId();
    const id = generateId();
    const body = bodyFor(owner, id, mutationId);
    expect((await create(owner, body)).status).toBe(201);
    await logProcessed(mutationId, id, owner.id);

    // The row exists already, so only the replay check can hand it back.
    const { status, data } = await create(owner, body);
    expect(status).toBe(201);
    expect(data.map((row) => row.id)).toEqual([id]);
  });
});
