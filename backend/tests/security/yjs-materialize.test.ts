import { appConfig } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { env } from '#/env';
import { createAppClient } from '../test-client';
import { mockFetchRequest, setTestConfig } from '../test-utils';
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
  let attachment: Awaited<ReturnType<typeof seedAttachment>>;

  const materialize = async (body: Record<string, unknown>, secret: string | null = env.YJS_RELAY_SECRET) => {
    const response = await internalApp.fetch(
      new Request('http://localhost/internal/yjs/materialize', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(secret === null ? {} : { 'x-yjs-relay-secret': secret }) },
        body: JSON.stringify(body),
      }),
    );
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  };

  const bodyFor = (
    scope: { tenantId: string; organizationId: string | null },
    text: string,
    editors: string[] = [owner.user.id],
    entityId = attachment.id,
  ) => ({
    entityType: 'attachment',
    entityId,
    ...scope,
    editors,
    description: paragraph(text),
  });

  const ownScope = () => ({ tenantId: owner.tenantId, organizationId: owner.organization.id });

  const stored = async () => attachment.read();

  beforeAll(async () => {
    mockFetchRequest();
    owner = await createTestTenant(call, 'materialize-owner');
    other = await createTestTenant(call, 'materialize-other');
    // Members update their own attachments only ('own' in the permission config), and this one is the owner's.
    member = await createOrgUser(call, owner.tenantId, owner.organization.id, 'materialize-member');
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
    expect((await materialize(bodyFor(ownScope(), 'no secret'), null)).status).toBe(401);
    expect((await materialize(bodyFor(ownScope(), 'wrong secret'), `${env.YJS_RELAY_SECRET}x`)).status).toBe(401);
    expect((await stored())?.description).toBe(original);
  });

  it("must not write through a body that names another tenant's organization", async () => {
    for (const organizationId of [other.organization.id, null]) {
      const { status, body } = await materialize(
        bodyFor({ tenantId: owner.tenantId, organizationId }, 'forged organization'),
      );
      expect(status, String(organizationId)).toBe(403);
      expect(body.type).toBe('forbidden');
    }
    expect((await stored())?.description).toBe(original);
  });

  it('must not write through a body that names another tenant', async () => {
    // The entity is not in the named tenant: for that document it is gone.
    const { status, body } = await materialize(
      bodyFor({ tenantId: other.tenantId, organizationId: owner.organization.id }, 'forged tenant'),
    );
    expect(status).toBe(410);
    expect(body).toEqual({ error: 'gone' });
    expect((await stored())?.description).toBe(original);
  });

  it('must not write when no editor of the log may still update the entity', async () => {
    for (const editors of [[member.id], [generateId()]]) {
      const { status, body } = await materialize(bodyFor(ownScope(), 'no rightful editor', editors));
      expect(status, editors.join()).toBe(403);
      expect(body.type).toBe('forbidden');
    }
    expect(await stored()).toEqual({ description: original, updatedBy: null });
  });

  it('credits the newest editor who may still update the entity (positive control)', async () => {
    // The member edited last but may not update the owner's attachment: the owner, who edited too, is credited.
    const { status, body } = await materialize(bodyFor(ownScope(), 'written by the relay', [member.id, owner.user.id]));
    expect(status).toBe(200);
    expect(body.editedBy).toBe(owner.user.id);
    const row = await stored();
    expect(row?.description).toContain('written by the relay');
    expect(row?.updatedBy).toBe(owner.user.id);
  });

  it('answers 410 for an entity that no longer exists, so the relay can drop its rows', async () => {
    const { status, body } = await materialize(bodyFor(ownScope(), 'too late', [owner.user.id], generateId()));
    expect(status).toBe(410);
    expect(body).toEqual({ error: 'gone' });
  });
});
