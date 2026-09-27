import { eq, sql } from 'drizzle-orm';
import { generatePasskeyChallenge, signInWithPasskey } from 'sdk';
import type { EntityRole } from 'shared';
import { expect } from 'vitest';
import { baseDb as db, getAdminDb } from '#/db/db';
import { passkeysTable } from '#/modules/auth/passkeys/passkeys-db';
import { adminRole, defaultHeaders, memberRole } from '../fixtures';
import { createOrganizationAdminUser, createTestOrganization, createTestSession, setCookiePair } from '../helpers';
import { type PasskeyAssertion, softwarePasskey } from '../software-passkey';
import { createAppClient, type TestResult } from '../test-client';

export interface TestTenant {
  tenantId: string;
  organization: { id: string; slug: string };
  user: { id: string; email: string };
  sessionCookie: string;
}

type Call = Awaited<ReturnType<typeof createAppClient>>;

/** Each call produces a unique tenant, for side-by-side cross-tenant tests. */
export async function createTestTenant(_call: Call, label: string): Promise<TestTenant> {
  const email = `${label}-user@security-test.com`;

  // Seeded via the DB as superuser, which bypasses RLS.
  const organization = await createTestOrganization();

  const user = await createOrganizationAdminUser(email, organization.id, adminRole, true, organization.tenantId);

  const sessionCookie = await createTestSession(user);

  return {
    tenantId: organization.tenantId,
    organization: { id: organization.id, slug: organization.slug },
    user: { id: user.id, email },
    sessionCookie,
  };
}

/** One organization per tenant, so a cross-org test needs a fresh tenant with its own org. */
export async function createSecondOrg() {
  return createTestOrganization();
}

export async function createOrgUser(
  _call: Call,
  tenantId: string,
  organizationId: string,
  label: string,
  role: EntityRole = memberRole,
) {
  const email = `${label}-user@security-test.com`;

  const user = await createOrganizationAdminUser(email, organizationId, role, true, tenantId);

  const sessionCookie = await createTestSession(user);

  return { id: user.id, email, sessionCookie };
}

/** Truncates tenant-scoped and auth tables on the admin connection (runtime_role holds no TRUNCATE). */
export async function clearSecurityTestData() {
  await getAdminDb('test cleanup').execute(sql`TRUNCATE TABLE
    sessions, tokens, passkeys, identities, emails,
    memberships, inactive_memberships, organizations, tenants, users, api_keys, service_accounts, actors,
    oidc_payloads, oauth_clients
    CASCADE`);
}

/**
 * A software passkey registered to `user` as a registration stores it: its row id, and the authenticator that answers
 * challenges for it. `counter` is the signature counter the row starts from.
 */
export async function insertPasskey(user: { id: string }, { counter = 0 } = {}) {
  const authenticator = softwarePasskey();
  const [{ id }] = await db
    .insert(passkeysTable)
    .values({
      userId: user.id,
      credentialId: authenticator.credentialId,
      publicKey: authenticator.publicKey,
      counter,
      nameOnDevice: 'Test device',
      deviceType: 'desktop',
    })
    .returning({ id: passkeysTable.id });
  return { id, ...authenticator };
}

export const passkeysOf = (userId: string) => db.select().from(passkeysTable).where(eq(passkeysTable.userId, userId));

/** The challenge a passkey challenge route issued, the credential ids it offers, and the cookie pair that carries it. */
export function issuedChallenge({ response, data }: TestResult) {
  expect(response.status).toBe(200);
  const { challenge, credentialIds } = data as { challenge: string; credentialIds?: string[] };
  return { challenge, credentialIds, cookie: setCookiePair(response, 'passkey-challenge') };
}

/** A passkey challenge of `type`, asked for as the page asks from a browser holding `cookie`. */
export async function passkeyChallenge(type: 'authentication' | 'mfa' | 'registration', cookie?: string) {
  const call = await createAppClient();
  const headers = cookie ? { ...defaultHeaders, Cookie: cookie } : defaultHeaders;
  return issuedChallenge(await call(generatePasskeyChallenge, { body: { type }, headers }));
}

/** Answers a passkey challenge on the sign-in route from a browser holding `cookie`. */
export async function passkeySignIn(
  assertion: PasskeyAssertion,
  cookie: string,
  type: 'authentication' | 'mfa' = 'authentication',
) {
  const call = await createAppClient();
  const headers = cookie ? { ...defaultHeaders, Cookie: cookie } : defaultHeaders;
  return call(signInWithPasskey, { body: { type, assertion }, headers });
}
