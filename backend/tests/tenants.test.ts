import { eq } from 'drizzle-orm';
import { getTenants, selfCreateTenant, type Tenant, updateTenant } from 'sdk';
import { nanoid } from 'shared/utils/nanoid';
import { afterEach, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { defaultRestrictions, type Restrictions } from '#/modules/tenants/tenant-restrictions';
import { tenantsTable } from '#/modules/tenants/tenants-db';
import { defaultHeaders } from './fixtures';
import { createSystemAdminUser, createTestOrganization, createTestSession } from './helpers';
import { createAppClient } from './test-client';
import { clearDatabase } from './test-utils';

// Each test signs in a system admin of its own; a system admin left behind shows up in the next file's user lists.
afterEach(async () => await clearDatabase());

/**
 * Stored restrictions can predate a field the schema gained. Every tenant response merges them with the current
 * defaults, so one stale row cannot fail the response validator of a whole list.
 */
describe('tenant responses with stored restrictions that lack a field', async () => {
  const call = await createAppClient();

  /** A system admin session, and a tenant stored before `allowUnregisteredClients` existed. */
  const staleTenant = async () => {
    const admin = await createSystemAdminUser(`tenants-${nanoid(8)}@test.com`);
    const headers = { ...defaultHeaders, Cookie: await createTestSession(admin) };
    const { quotas, rateLimits } = defaultRestrictions();
    const name = `Stale tenant ${nanoid(8)}`;
    const [tenant] = await db
      .insert(tenantsTable)
      .values({ name, restrictions: { quotas, rateLimits } as Restrictions })
      .returning();
    return { tenant, headers };
  };

  it('lists a tenant with the default for a missing restriction', async () => {
    const { tenant, headers } = await staleTenant();

    const { data, error, response } = await call(getTenants, { query: { q: tenant.name }, headers });

    // The SDK validates the response: a missing field fails the whole list, as it does in the frontend.
    expect(error).toBeUndefined();
    expect(response.status).toBe(200);
    const { items } = data as { items: { id: string; restrictions: Restrictions }[] };
    expect(items.map(({ id }) => id)).toEqual([tenant.id]);
    expect(items[0].restrictions).toEqual(defaultRestrictions());
  });

  it('updates a tenant and answers with the default for a missing restriction', async () => {
    const { tenant, headers } = await staleTenant();
    const quotas = { ...defaultRestrictions().quotas, organization: 7 };

    const renamed = await call(updateTenant, { path: { tenantId: tenant.id }, body: { name: 'Renamed' }, headers });
    const requoted = await call(updateTenant, {
      path: { tenantId: tenant.id },
      body: { restrictions: { quotas } },
      headers,
    });

    expect(renamed.error).toBeUndefined();
    expect(requoted.error).toBeUndefined();
    expect((renamed.data as { restrictions: Restrictions }).restrictions).toEqual(defaultRestrictions());
    expect((requoted.data as { restrictions: Restrictions }).restrictions).toEqual({ ...defaultRestrictions(), quotas });
    // A restrictions update stores the full shape.
    const [stored] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, tenant.id));
    expect(stored.restrictions).toEqual({ ...defaultRestrictions(), quotas });
  });
});

describe('tenant responses with the organization the tenant holds', async () => {
  const call = await createAppClient();

  const adminHeaders = async () => {
    const admin = await createSystemAdminUser(`tenants-${nanoid(8)}@test.com`);
    return { ...defaultHeaders, Cookie: await createTestSession(admin) };
  };

  it('lists and updates a tenant together with its organization', async () => {
    const headers = await adminHeaders();
    const organization = await createTestOrganization();
    const name = `Held tenant ${nanoid(8)}`;

    const updated = await call(updateTenant, { path: { tenantId: organization.tenantId }, body: { name }, headers });
    const listed = await call(getTenants, { query: { q: name }, headers });

    const expected = {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      thumbnailUrl: organization.thumbnailUrl,
      entityType: 'organization',
    };
    expect(updated.error).toBeUndefined();
    expect(listed.error).toBeUndefined();
    expect((updated.data as Tenant).organization).toEqual(expected);
    expect((listed.data as { items: Tenant[] }).items.map((tenant) => tenant.organization)).toEqual([expected]);
  });

  it('answers a self-created tenant without an organization', async () => {
    const headers = await adminHeaders();

    const created = await call(selfCreateTenant, { body: { name: `Own tenant ${nanoid(8)}` }, headers });
    // A retry reuses the orphan tenant and answers with it again.
    const retried = await call(selfCreateTenant, { body: { name: `Own tenant ${nanoid(8)}` }, headers });

    expect(created.error).toBeUndefined();
    expect((created.data as Tenant).organization).toBeNull();
    expect((retried.data as Tenant).id).toBe((created.data as Tenant).id);
    expect((retried.data as Tenant).organization).toBeNull();
  });
});
