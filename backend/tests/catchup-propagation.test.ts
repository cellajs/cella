import { eq } from 'drizzle-orm';
import { catchUpMyStream } from 'sdk';
import type { TestEntityHierarchyPlan } from 'shared/testing/entity-hierarchy';
import { assumeMemberAttachmentPolicy } from 'shared/testing/member-policy';
import { generateId } from 'shared/utils/entity-id';
import { afterAll, beforeAll, describe, expect, it, onTestFinished, vi } from 'vitest';
import { buildInsertableProduct } from '#/mocks';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { channelCountersTable } from '#/modules/entities/channel-counters-db';
import { maxHintRows } from '#/modules/entities/operations/propagation-hints';
import type { StreamCatchupResponse } from '#/schemas';
import { adminRole, defaultHeaders, memberRole } from './fixtures';
import { adminDb, createTestOrganization } from './helpers';
import { cleanupEntityHierarchy, insertAttachmentRow, joinAttachmentHome, seedAttachmentHome } from './hierarchy-helpers';
import { clearSecurityTestData, createOrgUser } from './security/helpers';
import { createAppClient } from './test-client';
import { setTestConfig } from './test-utils';

// The template declares no embedding: these two let the catchup of its product carry hints, and embed it twice.
vi.mock('shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shared')>();
  const productEmbeddings = [
    { embeddedProductType: 'attachment', hostProductType: 'attachment', hostColumn: 'attachments' },
    { embeddedProductType: 'attachment', hostProductType: 'attachment', hostColumn: 'cover' },
  ];
  return { ...actual, appConfig: { ...actual.appConfig, productEmbeddings } };
});

setTestConfig({ enabledAuthStrategies: ['passkey'] });

/**
 * A client that was away learns which embedded rows changed after its view's cursor from the propagation hints of its
 * catchup, and patches the copies its host rows hold. The read runs in the caller's tenant, tombstones included, and
 * names only rows the caller may read, so a hint never tells that a hidden row exists.
 */
describe('Catchup propagation hints', async () => {
  // A member reads only the attachments it created: another member's rows stand in for a channel the caller is not in.
  assumeMemberAttachmentPolicy({ read: 'own' });
  const call = await createAppClient();
  const cursor = 10;
  let organization: { id: string; tenantId: string };
  let plan: TestEntityHierarchyPlan;
  let admin: { id: string; sessionCookie: string };
  let member: { id: string; sessionCookie: string };
  let readable: string;
  let hidden: string;
  let removed: string;

  /** An attachment row of `home`, stamped at `seq`. */
  const attachmentRow = (home: { tenantId: string }, homePlan: TestEntityHierarchyPlan, createdBy: string, seq: number, overrides = {}) => {
    const id = generateId();
    const columns = { id, tenantId: home.tenantId, ...homePlan.channelIdColumns, createdBy, updatedBy: null, deletedBy: null, public: false };
    return buildInsertableProduct('attachment', { ...columns, seq, ...overrides }, id);
  };

  const insertAttachment = async (createdBy: string, seq: number, overrides: Record<string, unknown> = {}) => {
    const row = attachmentRow(organization, plan, createdBy, seq, overrides);
    await insertAttachmentRow(row);
    return row.id as string;
  };

  const hintsOf = async (as: { sessionCookie: string }, organizationId = organization.id) => {
    const view = { organizationId, productType: 'attachment' as const, cursor };
    const { data, response } = await call(catchUpMyStream, { body: { views: [view] }, headers: { ...defaultHeaders, Cookie: as.sessionCookie } });
    expect(response.status).toBe(200);
    return (data as StreamCatchupResponse).organizations[organizationId]?.propagation;
  };

  beforeAll(async () => {
    organization = await createTestOrganization();
    admin = await createOrgUser(call, organization.tenantId, organization.id, 'hints-admin', adminRole);
    member = await createOrgUser(call, organization.tenantId, organization.id, 'hints-member', memberRole);
    plan = await seedAttachmentHome(organization, admin.id);
    await joinAttachmentHome(organization, plan, member.id);

    // At the cursor, so the client holds it already.
    await insertAttachment(member.id, cursor);
    readable = await insertAttachment(member.id, cursor + 1);
    hidden = await insertAttachment(admin.id, cursor + 2);
    removed = await insertAttachment(member.id, cursor + 3, { deletedAt: new Date().toISOString(), deletedBy: member.id });
    await adminDb.insert(channelCountersTable).values({ channelKey: organization.id, counts: { 'e:f:attachment': cursor + 3 } });
  });

  afterAll(async () => {
    await adminDb.delete(attachmentsTable).where(eq(attachmentsTable.tenantId, organization.tenantId));
    await adminDb.delete(channelCountersTable).where(eq(channelCountersTable.channelKey, organization.id));
    await cleanupEntityHierarchy(adminDb, plan);
    await clearSecurityTestData();
  });

  // The client patches every host column its own config declares, so one hint per embedded product is the contract it reads.
  it('must not name a changed row the caller cannot read in a hint, and names the embedded product once however many hosts embed it', async () => {
    expect(await hintsOf(member)).toEqual([{ embeddedProductType: 'attachment', update: [readable], remove: [removed], untilSeq: cursor + 3 }]);
  });

  it('names every changed row, the soft-deleted one as removed, to a caller who reads them all (positive control)', async () => {
    const [hint] = (await hintsOf(admin)) ?? [];
    expect(hint?.update.toSorted()).toEqual([readable, hidden].toSorted());
    expect(hint?.remove).toEqual([removed]);
  });

  it('tells the caller the highest position among the rows it may read, never that of a row it cannot', async () => {
    const later = await insertAttachment(admin.id, cursor + 4);
    onTestFinished(async () => {
      await adminDb.delete(attachmentsTable).where(eq(attachmentsTable.id, later));
    });

    expect((await hintsOf(member))?.map(({ untilSeq }) => untilSeq)).toEqual([cursor + 3]);
    expect((await hintsOf(admin))?.map(({ untilSeq }) => untilSeq)).toEqual([cursor + 4]);
  });

  it('names no row of an organization where more changed than one hint names, and says so: the client refetches the host lists', async () => {
    const bulk = await createTestOrganization();
    const bulkAdmin = await createOrgUser(call, bulk.tenantId, bulk.id, 'hints-bulk-admin', adminRole);
    const bulkPlan = await seedAttachmentHome(bulk, bulkAdmin.id);
    onTestFinished(async () => {
      await adminDb.delete(attachmentsTable).where(eq(attachmentsTable.tenantId, bulk.tenantId));
      await adminDb.delete(channelCountersTable).where(eq(channelCountersTable.channelKey, bulk.id));
      await cleanupEntityHierarchy(adminDb, bulkPlan);
    });
    const rows = Array.from({ length: maxHintRows + 1 }, (_, index) => attachmentRow(bulk, bulkPlan, bulkAdmin.id, cursor + 1 + index));
    await Promise.all(rows.map(insertAttachmentRow));
    await adminDb.insert(channelCountersTable).values({ channelKey: bulk.id, counts: { 'e:f:attachment': cursor + rows.length } });

    expect(await hintsOf(bulkAdmin, bulk.id)).toEqual([
      { embeddedProductType: 'attachment', update: [], remove: [], overflow: true, untilSeq: expect.any(Number) },
    ]);
  });
});
