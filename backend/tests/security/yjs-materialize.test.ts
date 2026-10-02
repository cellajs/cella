import { and, asc, eq, isNull } from 'drizzle-orm';
import { updateAttachment } from 'sdk';
import { appConfig } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateServerHLC } from '#/core/stx';
import { modeSecret } from '#/env';
import { descriptionToSeed } from '#/modules/yjs/helpers/description-update';
import { yjsDocumentsTable, yjsUpdatesTable } from '#/modules/yjs/yjs-db';
import { mockStxBase } from '#/schemas/sync-transaction-mocks';
import { adminRole, defaultHeaders } from '../fixtures';
import { adminDb, expectRefusal } from '../helpers';
import { createAppClient } from '../test-client';
import { setTestConfig } from '../test-utils';
import { clearSecurityTestData, createOrgUser, createTestTenant, type TestTenant } from './helpers';
import { holdAttachmentRow, lockWaiters, paragraph, seedAttachment } from './yjs-helpers';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

/**
 * The relay's materialize route (internal listener only) writes a collaborative description in the entity row's scope,
 * credited to the newest editor of the log who may still update the entity. A deleted entity answers 410, and a merge
 * that lacks an outside write of the document 409.
 */
describe.skipIf(appConfig.services.yjs.enabled === false)('Yjs materialize scope', async () => {
  const call = await createAppClient();
  const { internalApp } = await import('#/lib/listeners');
  const original = paragraph('original');
  let owner: TestTenant;
  let other: TestTenant;
  let member: Awaited<ReturnType<typeof createOrgUser>>;
  let admin: Awaited<ReturnType<typeof createOrgUser>>;
  let attachment: Awaited<ReturnType<typeof seedAttachment>>;
  const removals: (() => Promise<void>)[] = [];

  const materialize = async (body: Record<string, unknown>, secret: string | null = modeSecret('YJS_RELAY_SECRET')) => {
    const response = await internalApp.fetch(
      new Request('http://localhost/internal/yjs/materialize', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(secret === null ? {} : { 'x-yjs-relay-secret': secret }) },
        body: JSON.stringify(body),
      }),
      // The in-process call carries the loopback peer a co-hosted relay connects from.
      { incoming: { socket: { remoteAddress: '127.0.0.1' } } },
    );
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  };

  const bodyFor = (
    scope: { tenantId: string; organizationId: string | null },
    text: string,
    editors: string[] = [owner.user.id],
    entityId = attachment.id,
  ) => ({ entityType: 'attachment', entityId, ...scope, editors, description: paragraph(text) });

  const ownScope = () => ({ tenantId: owner.tenantId, organizationId: owner.organization.id });

  const stored = async () => attachment.read();

  beforeAll(async () => {
    owner = await createTestTenant(call, 'materialize-owner');
    other = await createTestTenant(call, 'materialize-other');
    // Members update their own attachments only ('own' in the permission config), and this one is the owner's.
    member = await createOrgUser(call, owner.tenantId, owner.organization.id, 'materialize-member');
    admin = await createOrgUser(call, owner.tenantId, owner.organization.id, 'materialize-admin', adminRole);
    attachment = await seedAttachment({
      tenantId: owner.tenantId,
      organizationId: owner.organization.id,
      createdBy: owner.user.id,
      description: original,
    });
  });

  afterAll(async () => {
    await attachment.remove();
    for (const remove of removals) await remove();
    await clearSecurityTestData();
  });

  /** An attachment of the owner with a collaborative document, as the relay seeds it from the row. */
  const withDocument = async () => {
    const live = await seedAttachment({
      tenantId: owner.tenantId,
      organizationId: owner.organization.id,
      createdBy: owner.user.id,
      description: original,
    });
    removals.push(async () => {
      await adminDb.delete(yjsUpdatesTable).where(eq(yjsUpdatesTable.entityId, live.id));
      await adminDb.delete(yjsDocumentsTable).where(eq(yjsDocumentsTable.entityId, live.id));
      await live.remove();
    });
    await adminDb.insert(yjsDocumentsTable).values({
      entityType: 'attachment',
      entityId: live.id,
      ...ownScope(),
      state: Buffer.from(descriptionToSeed(original)),
    });
    return live;
  };

  /** An outside write of the description, as the REST API takes it: it appends a server-origin row to the log. */
  const writeOutside = (entityId: string, text: string) =>
    call(updateAttachment, {
      path: { organizationId: owner.organization.id, tenantId: owner.tenantId, id: entityId },
      body: {
        ops: { description: paragraph(text) },
        stx: { ...mockStxBase(`stx:${generateId()}`), fieldTimestamps: { description: generateServerHLC('test-client') } },
      },
      headers: { ...defaultHeaders, Cookie: owner.sessionCookie },
    });

  /** The ids of a document's server-origin log rows, oldest first. */
  const serverRowsOf = async (entityId: string) =>
    (
      await adminDb
        .select({ id: yjsUpdatesTable.id })
        .from(yjsUpdatesTable)
        .where(and(eq(yjsUpdatesTable.entityId, entityId), isNull(yjsUpdatesTable.userId)))
        .orderBy(asc(yjsUpdatesTable.id))
    ).map((row) => row.id);

  it('must not write without the relay secret or with a wrong one', async () => {
    const refused = await materialize(bodyFor(ownScope(), 'no secret'), null);
    await expectRefusal(refused, 401, 'unauthorized');
    expect((await materialize(bodyFor(ownScope(), 'wrong secret'), `${modeSecret('YJS_RELAY_SECRET')}x`)).status).toBe(401);
    expect((await stored())?.description).toBe(original);
  });

  it('refuses a body the schema rejects as every route does', async () => {
    const bodies = [
      { ...bodyFor(ownScope(), 'no editors'), editors: [] },
      { ...bodyFor(ownScope(), 'fractional row id'), serverRowIds: [1.5] },
      { ...bodyFor(ownScope(), 'too many row ids'), serverRowIds: Array.from({ length: 10_001 }, (_, i) => i + 1) },
    ];
    for (const refused of bodies) await expectRefusal(await materialize(refused), 400, 'invalid_request', refused.description);
    expect((await stored())?.description).toBe(original);
  });

  it("must not write through a body that names another tenant's organization", async () => {
    for (const organizationId of [other.organization.id, null]) {
      const { status, body } = await materialize(bodyFor({ tenantId: owner.tenantId, organizationId }, 'forged organization'));
      await expectRefusal({ status, body }, 403, 'forbidden', String(organizationId));
    }
    expect((await stored())?.description).toBe(original);
  });

  it('must not write through a body that names another tenant', async () => {
    // The entity is not in the named tenant: for that document it is gone.
    const { status, body } = await materialize(bodyFor({ tenantId: other.tenantId, organizationId: owner.organization.id }, 'forged tenant'));
    await expectRefusal({ status, body }, 410, 'not_found');
    expect((await stored())?.description).toBe(original);
  });

  it('must not write when no editor of the log may still update the entity', async () => {
    for (const editors of [[member.id], [generateId()]]) {
      const { status, body } = await materialize(bodyFor(ownScope(), 'no rightful editor', editors));
      await expectRefusal({ status, body }, 403, 'forbidden', editors.join());
    }
    expect(await stored()).toEqual({ description: original, updatedBy: null });
  });

  it('credits the newest editor who may still update the entity (positive control)', async () => {
    // Newest first: the member edited last but may not update the owner's attachment; of the admin and the owner, who
    // both may, the admin edited later and is credited.
    const editors = [member.id, admin.id, owner.user.id];
    const { status } = await materialize(bodyFor(ownScope(), 'written by the relay', editors));
    expect(status).toBe(200);
    const row = await stored();
    expect(row?.description).toContain('written by the relay');
    expect(row?.updatedBy).toBe(admin.id);
  });

  it('answers 410 for an entity that no longer exists, so the relay can drop its rows', async () => {
    const { status, body } = await materialize(bodyFor(ownScope(), 'too late', [owner.user.id], generateId()));
    await expectRefusal({ status, body }, 410, 'not_found');
  });

  it('must not write a merge that lacks an outside write of the document: 409, and the row keeps the write (12, X4)', async () => {
    const live = await withDocument();
    expect((await writeOutside(live.id, 'written outside')).response.status).toBe(200);
    const [serverRow] = await serverRowsOf(live.id);

    // A relay from before release 2 sends no ids, which reads as none.
    const legacy = bodyFor(ownScope(), 'stale merge', [owner.user.id], live.id);
    for (const serverRowIds of [[], [serverRow + 1], undefined]) {
      await expectRefusal(await materialize({ ...legacy, serverRowIds }), 409, 'field_conflict', String(serverRowIds));
    }
    expect((await live.read())?.description).toContain('written outside');
  });

  it('writes a merge whose window holds every server row of the document (13, positive control)', async () => {
    const live = await withDocument();
    expect((await writeOutside(live.id, 'written outside')).response.status).toBe(200);
    const serverRowIds = await serverRowsOf(live.id);
    expect(serverRowIds).toHaveLength(1);

    // At the cap: the ids the window merged, and ids of rows long folded.
    const atCap = [...serverRowIds, ...Array.from({ length: 10_000 - serverRowIds.length }, (_, i) => Number.MAX_SAFE_INTEGER - i)];
    const { status } = await materialize({ ...bodyFor(ownScope(), 'merged with the write', [owner.user.id], live.id), serverRowIds: atCap });
    expect(status).toBe(200);
    expect((await live.read())?.description).toContain('merged with the write');
    // The relay's own write records nothing.
    expect(await serverRowsOf(live.id)).toEqual(serverRowIds);
  });

  it('must not let a merge in flight overwrite an outside write that commits first: the row ends as the write, in both orders (14, X4)', async () => {
    const staleMerge = (entityId: string) => materialize({ ...bodyFor(ownScope(), 'stale merge', [owner.user.id], entityId), serverRowIds: [] });

    // The write takes the row first: it commits with its server row, and the merge, which lacks it, is refused.
    const first = await withDocument();
    const heldFirst = await holdAttachmentRow(first.id);
    const write = writeOutside(first.id, 'written outside');
    await lockWaiters(1);
    const merge = staleMerge(first.id);
    await lockWaiters(2);
    heldFirst.release();
    await heldFirst.done;
    expect((await write).response.status).toBe(200);
    await expectRefusal(await merge, 409, 'field_conflict');
    expect((await first.read())?.description).toContain('written outside');

    // The merge takes the row first: it holds no server row to miss, and the write then writes over it.
    const second = await withDocument();
    const heldSecond = await holdAttachmentRow(second.id);
    const laterMerge = staleMerge(second.id);
    await lockWaiters(1);
    const laterWrite = writeOutside(second.id, 'written outside');
    await lockWaiters(2);
    heldSecond.release();
    await heldSecond.done;
    expect((await laterMerge).status).toBe(200);
    expect((await laterWrite).response.status).toBe(200);
    expect((await second.read())?.description).toContain('written outside');
    expect(await serverRowsOf(second.id)).toHaveLength(1);
  });
});
