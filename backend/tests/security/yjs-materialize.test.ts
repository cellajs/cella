import { appConfig } from 'shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { env } from '#/env';
import type { ErrorResponse } from '../helpers';
import { createAppClient } from '../test-client';
import { mockFetchRequest, setTestConfig } from '../test-utils';
import { clearSecurityTestData, createTestTenant, type TestTenant } from './helpers';
import { paragraph, seedAttachment } from './yjs-helpers';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

/**
 * The relay's materialize route (internal listener only) writes a collaborative description on behalf of the last
 * editor. Its body names the entity's tenant and organization: the backend takes the scope from the entity row and
 * refuses a body naming another.
 */
describe.skipIf(appConfig.services.yjs.enabled === false)('Yjs materialize scope', async () => {
  const call = await createAppClient();
  const { internalApp } = await import('#/lib/listeners');
  const original = paragraph('original');
  let owner: TestTenant;
  let other: TestTenant;
  let attachment: Awaited<ReturnType<typeof seedAttachment>>;

  const materialize = async (body: Record<string, unknown>, secret: string | null = env.YJS_RELAY_SECRET) => {
    const response = await internalApp.fetch(
      new Request('http://localhost/internal/yjs/materialize', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(secret === null ? {} : { 'x-yjs-relay-secret': secret }) },
        body: JSON.stringify(body),
      }),
    );
    return { status: response.status, error: (await response.json()) as ErrorResponse };
  };

  const bodyFor = (scope: { tenantId: string; organizationId: string | null }, text: string) => ({
    entityType: 'attachment',
    entityId: attachment.id,
    ...scope,
    editedBy: owner.user.id,
    description: paragraph(text),
  });

  const ownScope = () => ({ tenantId: owner.tenantId, organizationId: owner.organization.id });

  const storedDescription = async () => (await attachment.read())?.description ?? null;

  beforeAll(async () => {
    mockFetchRequest();
    owner = await createTestTenant(call, 'materialize-owner');
    other = await createTestTenant(call, 'materialize-other');
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
    expect(await storedDescription()).toBe(original);
  });

  it("must not write through a body that names another tenant's organization", async () => {
    for (const organizationId of [other.organization.id, null]) {
      const { status, error } = await materialize(
        bodyFor({ tenantId: owner.tenantId, organizationId }, 'forged organization'),
      );
      expect(status, String(organizationId)).toBe(403);
      expect(error.type).toBe('forbidden');
    }
    expect(await storedDescription()).toBe(original);
  });

  it('must not write through a body that names another tenant', async () => {
    const { status, error } = await materialize(
      bodyFor({ tenantId: other.tenantId, organizationId: owner.organization.id }, 'forged tenant'),
    );
    expect(status).toBe(404);
    expect(error.type).toBe('not_found');
    expect(await storedDescription()).toBe(original);
  });

  it("writes in the row's own scope (positive control)", async () => {
    const { status } = await materialize(bodyFor(ownScope(), 'written by the relay'));
    expect(status).toBe(200);
    expect(await storedDescription()).toContain('written by the relay');
  });
});
