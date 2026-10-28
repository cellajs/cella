import { eq } from 'drizzle-orm';
import { postAppCatchup } from 'sdk';
import type { TestEntityHierarchyPlan } from 'shared/testing/entity-hierarchy';
import { assumeMemberAttachmentPolicy } from 'shared/testing/member-policy';
import { generateId } from 'shared/utils/entity-id';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildInsertableProduct } from '#/mocks';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { channelCountersTable } from '#/modules/entities/channel-counters-db';
import type { AppCatchupResponse } from '#/schemas';
import { adminRole, defaultHeaders, memberRole } from './fixtures';
import { adminDb, createTestOrganization } from './helpers';
import { cleanupEntityHierarchy, insertAttachmentRow, joinAttachmentHome, seedAttachmentHome } from './hierarchy-helpers';
import { clearSecurityTestData, createOrgUser } from './security/helpers';
import { createAppClient } from './test-client';
import { setTestConfig } from './test-utils';

// The template declares no embedding: this one lets the catchup of its product carry hints.
vi.mock('shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shared')>();
  return {
    ...actual,
    appConfig: { ...actual.appConfig, productEmbeddings: [{ embeddedProduct: 'attachment', hostProduct: 'attachment', hostColumn: 'attachments' }] },
  };
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

  const insertAttachment = async (createdBy: string, seq: number, overrides: Record<string, unknown> = {}) => {
    const id = generateId();
    const columns = { id, tenantId: organization.tenantId, ...plan.channelIdColumns, createdBy, updatedBy: null, deletedBy: null, public: false };
    await insertAttachmentRow(buildInsertableProduct('attachment', { ...columns, seq, ...overrides }, id));
    return id;
  };

  const hintsOf = async (as: { sessionCookie: string }) => {
    const view = { key: 'organization', organizationId: organization.id, prefixes: [organization.id], entityTypes: ['attachment' as const], cursor };
    const { data, response } = await call(postAppCatchup, { body: { views: [view] }, headers: { ...defaultHeaders, Cookie: as.sessionCookie } });
    expect(response.status).toBe(200);
    return (data as AppCatchupResponse).organizations[organization.id]?.propagation;
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
    await adminDb
      .insert(channelCountersTable)
      .values({ channelKey: organization.id, counts: { 'e:f:attachment': cursor + 3 }, path: organization.id });
  });

  afterAll(async () => {
    await adminDb.delete(attachmentsTable).where(eq(attachmentsTable.tenantId, organization.tenantId));
    await adminDb.delete(channelCountersTable).where(eq(channelCountersTable.channelKey, organization.id));
    await cleanupEntityHierarchy(adminDb, plan);
    await clearSecurityTestData();
  });

  it('must not name a changed row the caller cannot read in a hint', async () => {
    expect(await hintsOf(member)).toEqual([
      { embeddedProduct: 'attachment', hostProduct: 'attachment', hostColumn: 'attachments', update: [readable], remove: [removed] },
    ]);
  });

  it('names every changed row, the soft-deleted one as removed, to a caller who reads them all (positive control)', async () => {
    const [hint] = (await hintsOf(admin)) ?? [];
    expect(hint?.update.toSorted()).toEqual([readable, hidden].toSorted());
    expect(hint?.remove).toEqual([removed]);
  });
});
