import { appConfig } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { modeSecret } from '#/env';
import { adminRole } from '../fixtures';
import { expectRefusal } from '../helpers';
import { createAppClient } from '../test-client';
import { setTestConfig } from '../test-utils';
import { clearSecurityTestData, createOrgUser, createTestTenant, type TestTenant } from './helpers';
import { paragraph, seedAttachment } from './yjs-helpers';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

/**
 * The relay's materialize route (internal listener only) writes a collaborative description in the entity row's scope,
 * credited to the newest editor of the log who may still update the entity. When none may, the edits stay with the
 * relay; a deleted entity answers 410 so the relay can drop its rows.
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
    await clearSecurityTestData();
  });

  it('must not write without the relay secret or with a wrong one', async () => {
    const refused = await materialize(bodyFor(ownScope(), 'no secret'), null);
    await expectRefusal(refused, 401, 'unauthorized');
    expect((await materialize(bodyFor(ownScope(), 'wrong secret'), `${modeSecret('YJS_RELAY_SECRET')}x`)).status).toBe(401);
    expect((await stored())?.description).toBe(original);
  });

  it('refuses a body the schema rejects as every route does', async () => {
    const { status, body } = await materialize({ ...bodyFor(ownScope(), 'no editors'), editors: [] });
    await expectRefusal({ status, body }, 400, 'invalid_request');
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
});
