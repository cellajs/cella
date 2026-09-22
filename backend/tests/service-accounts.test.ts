import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import {
  type CreateServiceAccountData,
  createCredential,
  createServiceAccount,
  getAttachments,
  getCredentials,
  getServiceAccounts,
  revokeCredential,
  updateOrganization,
  updateServiceAccount,
} from 'sdk';
import { appConfig } from 'shared';
import { afterEach, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { organizationsTable } from '#/modules/organization/organization-db';
import { principalsTable } from '#/modules/principals/principals-db';
import { credentialsTable } from '#/modules/service-accounts/credentials-db';
import { serviceAccountsTable } from '#/modules/service-accounts/service-accounts-db';
import { tenantsTable } from '#/modules/tenants/tenants-db';
import { hashToken } from '#/utils/hash-token';
import { defaultHeaders } from './fixtures';
import { createTestOrganization } from './helpers';
import { clearSecurityTestData, createOrgUser } from './security/helpers';
import { createAppClient } from './test-client';

afterEach(async () => await clearSecurityTestData());

type Scope = NonNullable<NonNullable<NonNullable<CreateServiceAccountData['body']>['key']>['scopes']>[number];

/** Machine requests carry no Origin and no cookie: a server, not a browser page. */
const machineHeaders = (key: string) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${key}` });

describe('Service accounts and API keys', async () => {
  const call = await createAppClient();

  async function orgWithAdmin(role: 'admin' | 'member' = 'admin') {
    const org = await createTestOrganization();
    const user = await createOrgUser(call, org.tenantId, org.id, `${role}-${nanoid(8)}`, role);
    return { org, user, headers: { ...defaultHeaders, Cookie: user.sessionCookie } };
  }

  async function issueKey(opts: { role?: 'admin' | 'member'; scopes?: Scope[] | null } = {}) {
    const ctx = await orgWithAdmin();
    const { data, response } = await call(createServiceAccount, {
      path: { tenantId: ctx.org.tenantId, organizationId: ctx.org.id },
      body: { name: 'CI bot', role: opts.role ?? 'member', key: { name: 'deploy', scopes: opts.scopes ?? null } },
      headers: ctx.headers,
    });
    expect(response.status).toBe(201);
    const created = data as {
      serviceAccount: { id: string };
      credential: { id: string; secret: string; prefix: string };
    };
    return { ...ctx, account: created.serviceAccount, credential: created.credential, key: created.credential.secret };
  }

  it('creates an account and its first key in one step, storing only the hash', async () => {
    const { account, credential, key } = await issueKey();

    expect(key.startsWith(`${appConfig.slug}_sk_test_`)).toBe(true);
    expect(credential.prefix).toBe(key.slice(0, credential.prefix.length));

    const [principal] = await db.select().from(principalsTable).where(eq(principalsTable.id, account.id));
    expect(principal.kind).toBe('service');
    const [row] = await db.select().from(credentialsTable).where(eq(credentialsTable.id, credential.id));
    expect(row.hash).toBe(hashToken(key));
    expect(JSON.stringify(row)).not.toContain(key);
  });

  it('refuses a member creating an account, and caps the role at the creator', async () => {
    const member = await orgWithAdmin('member');
    const { response } = await call(createServiceAccount, {
      path: { tenantId: member.org.tenantId, organizationId: member.org.id },
      body: { name: 'bot', role: 'member' },
      headers: member.headers,
    });
    expect(response.status).toBe(403);
  });

  it('authenticates a key as the service account and reads inside its organization', async () => {
    const { org, key } = await issueKey();
    const { response } = await call(getAttachments, {
      path: { tenantId: org.tenantId, organizationId: org.id },
      headers: machineHeaders(key),
    });
    expect(response.status).toBe(200);
  });

  it('writes provenance as the service account', async () => {
    const { org, key, account } = await issueKey({ role: 'admin' });
    const { response } = await call(updateOrganization, {
      path: { tenantId: org.tenantId, id: org.id },
      body: { name: 'Renamed by bot' },
      headers: machineHeaders(key),
    });
    expect(response.status).toBe(200);
    const [row] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, org.id));
    expect(row.updatedBy).toBe(account.id);
  });

  it('masks the account grants with the key scopes', async () => {
    const { org, key } = await issueKey({ role: 'admin', scopes: ['attachment:read'] });
    const { response } = await call(updateOrganization, {
      path: { tenantId: org.tenantId, id: org.id },
      body: { name: 'Should not happen' },
      headers: machineHeaders(key),
    });
    expect(response.status).toBe(403);
  });

  it('rejects a revoked key, a browser origin, and a foreign tenant', async () => {
    const { org, key, account, credential, headers } = await issueKey();

    const foreign = await call(getAttachments, {
      path: { tenantId: 'other01', organizationId: org.id },
      headers: machineHeaders(key),
    });
    expect(foreign.response.status).toBe(403);

    const browser = await call(getAttachments, {
      path: { tenantId: org.tenantId, organizationId: org.id },
      headers: { ...machineHeaders(key), Origin: appConfig.frontendUrl },
    });
    expect(browser.response.status).toBe(403);

    const revoked = await call(revokeCredential, {
      path: { tenantId: org.tenantId, organizationId: org.id, id: account.id, credentialId: credential.id },
      headers,
    });
    expect(revoked.response.status).toBe(200);

    const afterRevoke = await call(getAttachments, {
      path: { tenantId: org.tenantId, organizationId: org.id },
      headers: machineHeaders(key),
    });
    expect(afterRevoke.response.status).toBe(401);
  });

  it('rolls a key with an overlap window', async () => {
    const { org, account, credential, headers } = await issueKey();
    const { data, response } = await call(createCredential, {
      path: { tenantId: org.tenantId, organizationId: org.id, id: account.id },
      body: { name: 'deploy v2', rollFrom: credential.id, rollOverlapDays: 3 },
      headers,
    });
    expect(response.status).toBe(201);
    expect((data as { secret: string }).secret.startsWith(`${appConfig.slug}_sk_`)).toBe(true);

    const [old] = await db.select().from(credentialsTable).where(eq(credentialsTable.id, credential.id));
    expect(old.expiresAt).not.toBeNull();
    expect(new Date(old.expiresAt as string).getTime()).toBeGreaterThan(Date.now());
  });

  it('lists accounts and their keys for an admin, never the hash or the plaintext', async () => {
    const { org, headers, account, key } = await issueKey();
    const list = await call(getServiceAccounts, {
      path: { tenantId: org.tenantId, organizationId: org.id },
      headers,
    });
    expect(list.response.status).toBe(200);
    expect((list.data as { items: { id: string }[] }).items.map((item) => item.id)).toContain(account.id);

    const keys = await call(getCredentials, {
      path: { tenantId: org.tenantId, organizationId: org.id, id: account.id },
      headers,
    });
    expect(keys.response.status).toBe(200);
    const serialized = JSON.stringify(keys.data);
    expect(serialized).not.toContain(key);
    expect(serialized).not.toContain(hashToken(key));
  });

  it('refuses an expired key and a key of a disabled account', async () => {
    const expired = await issueKey();
    await db
      .update(credentialsTable)
      .set({ expiresAt: new Date(Date.now() - 1000).toISOString() })
      .where(eq(credentialsTable.id, expired.credential.id));
    const expiredCall = await call(getAttachments, {
      path: { tenantId: expired.org.tenantId, organizationId: expired.org.id },
      headers: machineHeaders(expired.key),
    });
    expect(expiredCall.response.status).toBe(401);

    const disabled = await issueKey();
    const update = await call(updateServiceAccount, {
      path: { tenantId: disabled.org.tenantId, organizationId: disabled.org.id, id: disabled.account.id },
      body: { status: 'disabled' },
      headers: disabled.headers,
    });
    expect(update.response.status).toBe(200);
    const disabledCall = await call(getAttachments, {
      path: { tenantId: disabled.org.tenantId, organizationId: disabled.org.id },
      headers: machineHeaders(disabled.key),
    });
    expect(disabledCall.response.status).toBe(401);
  });

  it('enforces the tenant quota on accounts', async () => {
    const ctx = await orgWithAdmin();
    const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, ctx.org.tenantId));
    await db
      .update(tenantsTable)
      .set({ restrictions: { ...tenant.restrictions, quotas: { ...tenant.restrictions.quotas, serviceAccount: 1 } } })
      .where(eq(tenantsTable.id, ctx.org.tenantId));
    const path = { tenantId: ctx.org.tenantId, organizationId: ctx.org.id };
    const first = await call(createServiceAccount, {
      path,
      body: { name: 'one', role: 'member' },
      headers: ctx.headers,
    });
    expect(first.response.status).toBe(201);
    const second = await call(createServiceAccount, {
      path,
      body: { name: 'two', role: 'member' },
      headers: ctx.headers,
    });
    expect(second.response.status).toBe(403);
  });

  it('refuses a roll from an unknown key without issuing anything', async () => {
    const { org, account, headers } = await issueKey();
    const before = await db.select().from(credentialsTable).where(eq(credentialsTable.principalId, account.id));
    const { response } = await call(createCredential, {
      path: { tenantId: org.tenantId, organizationId: org.id, id: account.id },
      body: { name: 'v2', rollFrom: '00000000-0000-4000-8000-000000000000', rollOverlapDays: 1 },
      headers,
    });
    expect(response.status).toBe(404);
    const after = await db.select().from(credentialsTable).where(eq(credentialsTable.principalId, account.id));
    expect(after).toHaveLength(before.length);
  });

  it('refuses revoking a key through another account and keeps the first revokedAt', async () => {
    const a = await issueKey();
    const b = await issueKey();
    const crossed = await call(revokeCredential, {
      path: { tenantId: a.org.tenantId, organizationId: a.org.id, id: a.account.id, credentialId: b.credential.id },
      headers: a.headers,
    });
    expect(crossed.response.status).toBe(404);

    const path = {
      tenantId: a.org.tenantId,
      organizationId: a.org.id,
      id: a.account.id,
      credentialId: a.credential.id,
    };
    expect((await call(revokeCredential, { path, headers: a.headers })).response.status).toBe(200);
    const [{ revokedAt }] = await db.select().from(credentialsTable).where(eq(credentialsTable.id, a.credential.id));
    expect((await call(revokeCredential, { path, headers: a.headers })).response.status).toBe(404);
    const [{ revokedAt: again }] = await db
      .select()
      .from(credentialsTable)
      .where(eq(credentialsTable.id, a.credential.id));
    expect(again).toBe(revokedAt);
  });

  it('refuses a service account without a grant at the tenant door', async () => {
    const { org, account, key } = await issueKey();
    await db.update(serviceAccountsTable).set({ grants: [] }).where(eq(serviceAccountsTable.id, account.id));
    const { response } = await call(getAttachments, {
      path: { tenantId: org.tenantId, organizationId: org.id },
      headers: machineHeaders(key),
    });
    expect(response.status).toBe(403);
  });
});
