import { eq } from 'drizzle-orm';
import { createOrganizations } from 'sdk';
import { hierarchy } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import { nanoidTenant } from 'shared/utils/nanoid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { clearTenantCache } from '#/middlewares/guard/tenant-cache';
import { organizationsTable } from '#/modules/organization/organization-db';
import { mockOrganization } from '#/modules/organization/organization-mocks';
import { tenantsTable } from '#/modules/tenants/tenants-db';
import { defaultHeaders } from '../fixtures';
import { createTestOrganization, createTestSession, createTestUser, type ErrorResponse } from '../helpers';
import { createAppClient } from '../test-client';
import { mockFetchRequest, setTestConfig } from '../test-utils';
import { clearSecurityTestData, createOrgUser, createTestTenant } from './helpers';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

const memberRole = hierarchy.getLeastPrivilegedRole('organization');

/** The parts of an error answer that come from the refusal itself, without the per-request path, id and time. */
const refusalOf = ({ status, type, name, message, severity, entityType, meta }: ErrorResponse) => ({
  status,
  type,
  name,
  message,
  severity,
  entityType,
  meta,
});

/**
 * Tenant ids are six characters, so an answer that differs for a missing, an inactive and a foreign tenant lets anyone
 * signed in enumerate tenants. The tenant creator's bootstrap access lasts until the tenant has its organization.
 */
describe('Tenant access', async () => {
  const call = await createAppClient();
  const { baseApp } = await import('#/routes');

  /** A route behind tenantGuard alone, so the guard is the only barrier. */
  const checkSlug = async (tenantId: string, sessionCookie: string) => {
    const response = await baseApp.request(`/entities/${tenantId}/check-slug`, {
      method: 'POST',
      headers: { ...defaultHeaders, Cookie: sessionCookie },
      body: JSON.stringify({ slug: 'tenant-access-free-slug', entityType: 'organization' }),
    });
    return {
      status: response.status,
      error: response.status === 204 ? null : ((await response.json()) as ErrorResponse),
    };
  };

  const setStatus = async (tenantId: string, status: 'active' | 'suspended') => {
    await db.update(tenantsTable).set({ status }).where(eq(tenantsTable.id, tenantId));
    clearTenantCache();
  };

  /** A tenant the user created, with the organization it holds when `withOrganization`; the creator is no member. */
  const createdTenant = async (createdBy: string, withOrganization: boolean) => {
    const [tenant] = await db.insert(tenantsTable).values({ name: 'Created Tenant', createdBy }).returning();
    if (withOrganization) await db.insert(organizationsTable).values({ ...mockOrganization(), tenantId: tenant.id });
    return tenant;
  };

  beforeAll(() => {
    mockFetchRequest();
  });

  afterAll(async () => await clearSecurityTestData());

  it('must not tell a missing, an inactive and a foreign tenant apart via tenantGuard', async () => {
    const outsider = await createTestTenant(call, 'tenant-access-outsider');
    const foreign = await createTestOrganization();
    const inactive = await createTestOrganization();
    await setStatus(inactive.tenantId, 'suspended');
    let missingTenantId = nanoidTenant();
    while ((await db.select().from(tenantsTable).where(eq(tenantsTable.id, missingTenantId))).length) {
      missingTenantId = nanoidTenant();
    }

    const answers = await Promise.all(
      [missingTenantId, inactive.tenantId, foreign.tenantId].map((tenantId) =>
        checkSlug(tenantId, outsider.sessionCookie),
      ),
    );
    for (const { status, error } of answers) {
      expect(status).toBe(403);
      expect(error?.type).toBe('forbidden');
    }
    const [missing, inactiveTenant, foreignTenant] = answers.map(({ error }) => refusalOf(error as ErrorResponse));
    expect(inactiveTenant).toEqual(missing);
    expect(foreignTenant).toEqual(missing);
  });

  it('tells a member that their tenant is inactive, and admits them while it is active (positive control)', async () => {
    const organization = await createTestOrganization();
    const member = await createOrgUser(
      call,
      organization.tenantId,
      organization.id,
      'tenant-access-member',
      memberRole,
    );
    expect((await checkSlug(organization.tenantId, member.sessionCookie)).status).toBe(204);

    await setStatus(organization.tenantId, 'suspended');
    const { status, error } = await checkSlug(organization.tenantId, member.sessionCookie);
    expect(status).toBe(403);
    expect(error?.meta).toEqual({ resource: 'tenant', tenantStatus: 'suspended' });
  });

  it("must not keep the creator's access to a tenant after it has its organization via tenantGuard", async () => {
    const creator = await createTestUser('tenant-access-creator@security-test.com');
    const sessionCookie = await createTestSession(creator);
    // The creator left the organization, or never joined it: the foothold must not outlive the bootstrap.
    const tenant = await createdTenant(creator.id, true);

    const { status, error } = await checkSlug(tenant.id, sessionCookie);
    expect(status).toBe(403);
    expect(error?.type).toBe('forbidden');
  });

  it('admits the creator to bootstrap a tenant that has no organization yet (positive control)', async () => {
    const creator = await createTestUser('tenant-access-founder@security-test.com');
    const sessionCookie = await createTestSession(creator);
    const tenant = await createdTenant(creator.id, false);

    expect((await checkSlug(tenant.id, sessionCookie)).status).toBe(204);
    const { response } = await call(createOrganizations, {
      path: { tenantId: tenant.id },
      body: [{ id: `temp-${generateId()}`, name: 'Founded', slug: 'tenant-access-founded' }],
      headers: { ...defaultHeaders, Cookie: sessionCookie },
    });
    expect(response.status).toBe(201);
  });
});
