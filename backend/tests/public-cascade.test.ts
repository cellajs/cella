import { inArray, sql } from 'drizzle-orm';
import { batchCreateAttachments, presignPublicAttachmentUrls, updateOrganization } from 'sdk';
import { entityIdColumnKey, hierarchy, publicReadGrants } from 'shared';
import { channelsDownToStrictHome, type TestEntityHierarchyPlan } from 'shared/testing/entity-hierarchy';
import { generateId } from 'shared/utils/entity-id';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ActorContext } from '#/core/context';
import { baseDb } from '#/db/db';
import { tenantContext } from '#/db/tenant-context';
import { defineBackendModule } from '#/lib/module';
import type { MutationHandler } from '#/lib/mutation-bus';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { publicCascadeHandlers } from '#/permissions/public-cascade';
import { getEntityTable } from '#/tables';
import { defaultHeaders } from './fixtures';
import { adminDb } from './helpers';
import { attachmentBody, cleanupEntityHierarchy, insertAttachmentIn, joinAttachmentHome, seedAttachmentHome } from './hierarchy-helpers';
import { clearSecurityTestData, createTestTenant, type TestTenant } from './security/helpers';
import { createAppClient } from './test-client';
import { setTestConfig } from './test-utils';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

/** The channel `seedAttachmentHome` homes attachments at, the deepest strict ancestor; its toggle is the event the cascade listens on. */
const [homeType = 'organization'] = channelsDownToStrictHome(
  hierarchy.getOrderedAncestors('attachment'),
  hierarchy.getNullableAncestors('attachment'),
);
const homeEvent = `${homeType}.updated` as const;

/** Set by a test to look into `organization.updated` from a handler registered after the modules' own. */
let probe: ((ctx: ActorContext) => Promise<void>) | undefined;

// Run it as `TEST_DB_ROLE=runtime` too: the superuser of the default run updates soft-deleted rows past RLS.
describe("Public cascade: a channel's `public` reaches the products homed there", async () => {
  const call = await createAppClient();
  let tenant: TestTenant;
  let other: TestTenant;
  let plan: TestEntityHierarchyPlan;
  let otherPlan: TestEntityHierarchyPlan;

  const pathOf = (t: TestTenant) => ({ tenantId: t.tenantId, organizationId: t.organization.id });
  const headersOf = (t: TestTenant) => ({ ...defaultHeaders, Cookie: t.sessionCookie });
  const homeIdOf = (t: TestTenant, p: TestEntityHierarchyPlan) =>
    homeType === 'organization' ? t.organization.id : p.channelIdColumns[entityIdColumnKey(homeType)];
  const homeRow = (t: TestTenant, p: TestEntityHierarchyPlan, isPublic: boolean) => ({
    id: homeIdOf(t, p),
    tenantId: t.tenantId,
    organizationId: t.organization.id,
    public: isPublic,
  });
  // A stand-in for the request context a channel write runs in, with the fields a tenant transaction reads.
  const ctxOf = (t: TestTenant) => ({ var: { db: baseDb, tenantId: t.tenantId, actor: { id: t.user.id } } }) as unknown as ActorContext;

  const handlerWith = (maxRows?: number) => {
    const handler = publicCascadeHandlers({ publicGrants: { attachment: true }, maxRows })[homeEvent];
    if (!handler) throw new Error(`no cascade handler for ${homeEvent}`);
    return handler as MutationHandler;
  };
  /** The home's toggle as its write dispatches it: before and after rows, in a transaction that reads soft-deleted rows. */
  const toggle = (t: TestTenant, p: TestEntityHierarchyPlan, isPublic: boolean, maxRows?: number) =>
    tenantContext(
      ctxOf(t),
      (txCtx) =>
        // The handler reads a channel row's id, tenant, organization and flag; the test row carries no more.
        handlerWith(maxRows)(txCtx, {
          before: [homeRow(t, p, !isPublic)],
          after: [homeRow(t, p, isPublic)],
        } as unknown as Parameters<MutationHandler>[1]),
      { includeDeleted: true },
    );

  const rows = (ids: string[]) => adminDb.select().from(attachmentsTable).where(inArray(attachmentsTable.id, ids));
  const publicById = async (ids: string[]) => Object.fromEntries((await rows(ids)).map((row) => [row.id, row.public]));
  const insertIn = (t: TestTenant, p: TestEntityHierarchyPlan, columns: Record<string, unknown> = {}) => {
    const id = generateId();
    return insertAttachmentIn(p, { id, tenantId: t.tenantId, createdBy: t.user.id, ...columns }).then(() => id);
  };

  beforeAll(async () => {
    tenant = await createTestTenant(call, 'public-cascade');
    other = await createTestTenant(call, 'public-cascade-other');
    plan = await seedAttachmentHome({ id: tenant.organization.id, tenantId: tenant.tenantId }, tenant.user.id);
    otherPlan = await seedAttachmentHome({ id: other.organization.id, tenantId: other.tenantId }, other.user.id);
    await joinAttachmentHome({ id: tenant.organization.id, tenantId: tenant.tenantId }, plan, tenant.user.id);

    // Registered after the app loaded its modules, so it runs after the template's handlers.
    defineBackendModule({
      name: 'public-cascade-probe',
      owner: 'app',
      scope: ['backend'],
      description: 'Looks into organization.updated from inside the write',
      onMutation: { 'organization.updated': async (ctx) => probe?.(ctx) },
    });
  });

  afterAll(async () => {
    probe = undefined;
    await adminDb.delete(attachmentsTable).where(inArray(attachmentsTable.tenantId, [tenant.tenantId, other.tenantId]));
    await cleanupEntityHierarchy(adminDb, plan, otherPlan);
    await clearSecurityTestData();
  });

  it('flips the rows homed there, soft-deleted ones included, with server ids and no edit stamps, and leaves another organization alone', async () => {
    const live = await insertIn(tenant, plan);
    const deleted = await insertIn(tenant, plan, { deletedAt: new Date().toISOString(), deletedBy: tenant.user.id });
    const elsewhere = await insertIn(other, otherPlan);
    const [storedBefore] = await rows([live]);

    await toggle(tenant, plan, true);
    expect(await publicById([live, deleted, elsewhere])).toEqual({ [live]: true, [deleted]: true, [elsewhere]: false });

    // A server-origin write: the server's ids in the stx, so the last editor's tab takes no echo, and no edit stamps.
    const [storedAfter] = await rows([live]);
    expect(storedAfter.stx).toMatchObject({ sourceId: 'server', fieldTimestamps: storedBefore.stx.fieldTimestamps });
    expect(storedAfter.stx.mutationId).not.toBe(storedBefore.stx.mutationId);
    expect([storedAfter.updatedAt, storedAfter.updatedBy]).toEqual([storedBefore.updatedAt, storedBefore.updatedBy]);

    await toggle(tenant, plan, false);
    expect(await publicById([live, deleted, elsewhere])).toEqual({ [live]: false, [deleted]: false, [elsewhere]: false });
  });

  it('refuses a toggle past the row cap and leaves the rows as they were', async () => {
    const ids = [await insertIn(tenant, plan), await insertIn(tenant, plan)];

    await expect(toggle(tenant, plan, true, 1)).rejects.toMatchObject({ status: 409, type: 'channel_too_large' });
    expect(Object.values(await publicById(ids))).toEqual([false, false]);
  });

  it("needs the channel write's transaction", async () => {
    const payload = { before: [homeRow(tenant, plan, false)], after: [homeRow(tenant, plan, true)] } as unknown as Parameters<MutationHandler>[1];
    await expect(handlerWith()(ctxOf(tenant), payload)).rejects.toThrow(/transaction/);
  });

  it('dispatches organization.updated inside the write, with soft-deleted rows readable', async () => {
    const sightings: Record<string, unknown>[] = [];
    probe = async (ctx) => {
      const settings = await ctx.var.db.execute<{ tenantId: string; includeDeleted: string }>(
        sql`SELECT current_setting('app.tenant_id', true) AS "tenantId", current_setting('app.include_deleted', true) AS "includeDeleted"`,
      );
      sightings.push({ onBarePool: ctx.var.db === baseDb, ...settings.rows[0] });
    };

    const updated = await call(updateOrganization, { path: pathOf(tenant), body: { name: 'Public cascade' }, headers: headersOf(tenant) });
    probe = undefined;

    expect(updated.response.status).toBe(200);
    expect(sightings).toEqual([{ onBarePool: false, tenantId: tenant.tenantId, includeDeleted: 'true' }]);
  });

  it('gives a create that overlaps a toggle the flag the toggle leaves', async () => {
    const homeTable = getEntityTable(homeType);
    const homeId = homeIdOf(tenant, plan);
    const id = generateId();
    let creating: ReturnType<typeof call<typeof batchCreateAttachments>> | undefined;

    // The toggle's lock is held first; the create's read of the home's flag waits for the commit and sees the new value.
    await adminDb.transaction(async (tx) => {
      await tx.execute(sql`SELECT 1 FROM ${homeTable} WHERE ${homeTable.id} = ${homeId} FOR UPDATE`);
      creating = call(batchCreateAttachments, { path: pathOf(tenant), body: [attachmentBody(id, plan)], headers: headersOf(tenant) });
      await new Promise((resolve) => setTimeout(resolve, 300));
      await tx.execute(sql`UPDATE ${homeTable} SET public = true WHERE ${homeTable.id} = ${homeId}`);
    });

    expect((await creating)?.response.status).toBe(201);
    expect((await rows([id]))[0]).toMatchObject({ public: true });

    await adminDb.execute(sql`UPDATE ${homeTable} SET public = false WHERE ${homeTable.id} = ${homeId}`);
  });

  // An app that grants public read on attachments proves the signing path in its own run.
  it.skipIf(publicReadGrants.attachment)('signs the file of a public row for no visitor while the app grants no public read', async () => {
    const id = await insertIn(tenant, plan, { public: true });

    const result = await call(presignPublicAttachmentUrls, {
      path: pathOf(tenant),
      body: { items: [{ attachmentId: id, variant: 'original' }] },
      headers: defaultHeaders,
    });

    expect(result.response.status).toBe(200);
    expect(result.data).toEqual({ results: [], rejectedIds: [id] });
  });
});
