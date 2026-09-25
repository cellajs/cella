import { getYjsToken } from 'sdk';
import { appConfig } from 'shared';
import { testYjsTokenPublicKey } from 'shared/testing/yjs-token-keys';
import { generateId } from 'shared/utils/entity-id';
import { verifyYjsToken, yjsTokenVerifyKey } from 'shared/utils/yjs-token';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getAdminDb } from '#/db/db';
import { systemRolesTable } from '#/modules/system/system-roles-db';
import { defaultHeaders } from '../fixtures';
import { createOrganizationAdminUser, createSystemAdminUser, createTestSession, type ErrorResponse } from '../helpers';
import { createAppClient } from '../test-client';
import { mockFetchRequest, setTestConfig } from '../test-utils';
import { clearSecurityTestData, createOrgUser, createTestTenant, type TestTenant } from './helpers';
import { paragraph, seedAttachment } from './yjs-helpers';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

const TOKEN_TTL_MS = 5 * 60 * 1000;

/**
 * The relay trusts every claim of a Yjs token without asking the backend: a token names one entity the caller may
 * update, with the tenant and organization of its row, and lives five minutes. The route is tenant- and
 * organization-guarded and checks update on the row itself.
 */
describe.skipIf(appConfig.services.yjs.enabled === false)('Yjs token security', async () => {
  const call = await createAppClient();
  let owner: TestTenant;
  let other: TestTenant;
  let member: Awaited<ReturnType<typeof createOrgUser>>;
  let ownersAttachment: Awaited<ReturnType<typeof seedAttachment>>;
  let membersAttachment: Awaited<ReturnType<typeof seedAttachment>>;
  let otherTenantAttachment: Awaited<ReturnType<typeof seedAttachment>>;

  const tokenFor = (cookie: string, scope: { tenantId: string; organizationId: string }, entityId: string) =>
    call(getYjsToken, {
      path: scope,
      query: { entityType: 'attachment', entityId },
      headers: { ...defaultHeaders, Cookie: cookie },
    });

  const ownScope = () => ({ tenantId: owner.tenantId, organizationId: owner.organization.id });

  beforeAll(async () => {
    mockFetchRequest();
    owner = await createTestTenant(call, 'yjs-token-owner');
    other = await createTestTenant(call, 'yjs-token-other');
    member = await createOrgUser(call, owner.tenantId, owner.organization.id, 'yjs-token-member');
    const attachmentIn = (tenant: TestTenant, createdBy: string) =>
      seedAttachment({
        tenantId: tenant.tenantId,
        organizationId: tenant.organization.id,
        createdBy,
        description: paragraph('original'),
      });
    ownersAttachment = await attachmentIn(owner, owner.user.id);
    membersAttachment = await attachmentIn(owner, member.id);
    otherTenantAttachment = await attachmentIn(other, other.user.id);
  });

  afterAll(async () => {
    for (const attachment of [ownersAttachment, membersAttachment, otherTenantAttachment]) await attachment.remove();
    await clearSecurityTestData();
  });

  it("signs the caller, the entity and its row's scope, for five minutes (positive control)", async () => {
    const before = Date.now();
    const { data, response } = await tokenFor(owner.sessionCookie, ownScope(), ownersAttachment.id);
    expect(response.status).toBe(200);

    // The relay's check: the public half of the backend's key, the only key the relay holds.
    const verified = verifyYjsToken((data as { token: string }).token, yjsTokenVerifyKey(testYjsTokenPublicKey));
    if (!verified.ok) throw new Error(`token did not verify: ${verified.reason}`);
    const { exp, ...claims } = verified.payload;
    expect(claims).toEqual({
      userId: owner.user.id,
      entityType: 'attachment',
      entityId: ownersAttachment.id,
      tenantId: owner.tenantId,
      organizationId: owner.organization.id,
    });
    expect(exp).toBeGreaterThanOrEqual(before + TOKEN_TTL_MS);
    expect(exp).toBeLessThanOrEqual(Date.now() + TOKEN_TTL_MS);

    // A member edits what they created.
    expect((await tokenFor(member.sessionCookie, ownScope(), membersAttachment.id)).response.status).toBe(200);
  });

  it('must not sign a token for an entity the caller may not update', async () => {
    // Members update their own attachments only ('own' in the permission config).
    const { data, error, response } = await tokenFor(member.sessionCookie, ownScope(), ownersAttachment.id);
    expect(response.status).toBe(403);
    expect((error as ErrorResponse).type).toBe('forbidden');
    expect(data).toBeUndefined();
  });

  it("must not sign a token for another tenant's entity", async () => {
    // Through that tenant's path, the tenant guard refuses.
    const viaTheirPath = await tokenFor(
      owner.sessionCookie,
      { tenantId: other.tenantId, organizationId: other.organization.id },
      otherTenantAttachment.id,
    );
    expect(viaTheirPath.response.status).toBe(403);
    expect((viaTheirPath.error as ErrorResponse).type).toBe('forbidden');
    expect(viaTheirPath.data).toBeUndefined();

    // Through the caller's own path, the row is outside the request's scope and reads as missing.
    const viaOwnPath = await tokenFor(owner.sessionCookie, ownScope(), otherTenantAttachment.id);
    expect(viaOwnPath.response.status).toBe(404);
    expect((viaOwnPath.error as ErrorResponse).type).toBe('not_found');
    expect(viaOwnPath.data).toBeUndefined();
  });

  it('must not sign a system admin a token the relay would refuse: collaboration confers no system-admin bypass', async () => {
    const admin = await createSystemAdminUser('yjs-token-sysadmin@security-test.com');
    const adminCookie = await createTestSession(admin);
    const { data, error, response } = await tokenFor(adminCookie, ownScope(), ownersAttachment.id);
    expect(response.status).toBe(403);
    expect((error as ErrorResponse).type).toBe('forbidden');
    expect(data).toBeUndefined();

    // Positive control: a system admin whose membership grants update gets one, as the relay would accept.
    const member = await createOrganizationAdminUser(
      'yjs-token-sysadmin-member@security-test.com',
      owner.organization.id,
      'admin',
      true,
      owner.tenantId,
    );
    await getAdminDb('yjs token test')
      .insert(systemRolesTable)
      .values({ id: member.id, userId: member.id, role: 'admin' });
    const memberCookie = await createTestSession(member);
    expect((await tokenFor(memberCookie, ownScope(), ownersAttachment.id)).response.status).toBe(200);
  });

  it('must not sign a token for an entity that does not exist', async () => {
    const { data, error, response } = await tokenFor(owner.sessionCookie, ownScope(), generateId());
    expect(response.status).toBe(404);
    expect((error as ErrorResponse).type).toBe('not_found');
    expect(data).toBeUndefined();
  });
});
