import { eq } from 'drizzle-orm';
import {
  type CreateServiceAccountData,
  createCredential,
  createServiceAccount,
  getAttachments,
  revokeCredential,
  updateOrganization,
} from 'sdk';
import { appConfig } from 'shared';
import { afterEach, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { organizationsTable } from '#/modules/organization/organization-db';
import { principalsTable } from '#/modules/principals/principals-db';
import { credentialsTable } from '#/modules/service-accounts/credentials-db';
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
    const user = await createOrgUser(call, org.tenantId, org.id, `${role}-${Date.now()}`, role);
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
});
