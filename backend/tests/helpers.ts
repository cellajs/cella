import type { z } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';
import type { EntityRole } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import { nanoid } from 'shared/utils/nanoid';
import { baseDb as db } from '#/db/db';
import { mockPastIsoDate } from '#/mocks';
import { authCookieName } from '#/modules/auth/general/helpers/cookie';
import { sessionsTable } from '#/modules/auth/sessions-db';
import { tokensTable } from '#/modules/auth/tokens-db';
import { encryptTotpSecret } from '#/modules/auth/totps/helpers/totp-secret-encryption';
import { totpsTable } from '#/modules/auth/totps/totps-db';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { type OrganizationModel, organizationsTable } from '#/modules/organization/organization-db';
import { mockOrganization } from '#/modules/organization/organization-mocks';
import { systemRolesTable } from '#/modules/system/system-roles-db';
import { tenantsTable } from '#/modules/tenants/tenants-db';
import { emailsTable } from '#/modules/user/emails-db';
import { unsubscribeTokensTable } from '#/modules/user/unsubscribe-tokens-db';
import { type UserModel, usersTable } from '#/modules/user/user-db';
import { mockEmail, mockUnsubscribeToken, mockUser } from '#/modules/user/user-mocks';
import type { apiErrorSchema } from '#/schemas';
import { hashToken } from '#/utils/hash-token';

export type ErrorResponse = z.infer<typeof apiErrorSchema>;

/** User with a verified email, for OAuth/passkey tests. */
export async function createUser(email: string) {
  const userRecord = mockUser({ email });
  const [user] = await db.insert(usersTable).values(userRecord).returning();
  await db.insert(emailsTable).values(mockEmail(user));
  return user;
}

/** Returns the raw token string, for use in cookies. */
export async function createMfaToken(user: { id: string; email: string }) {
  const mfaToken = nanoid(40);
  const hashedMfaToken = hashToken(mfaToken);
  await db.insert(tokensTable).values({
    secret: hashedMfaToken,
    type: 'confirm-mfa',
    userId: user.id,
    email: user.email,
    createdBy: user.id,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  });
  return mfaToken;
}

export async function createTotpUser(email: string) {
  const user = await createTestUser(email);
  await verifyUserEmail(email);
  await db.insert(totpsTable).values({
    userId: user.id,
    secret: encryptTotpSecret('JBSWY3DPEHPK3PXP'),
    createdAt: mockPastIsoDate(),
  });
  await enableMFAForUser(user.id);
  return user;
}

/** WebAuthn `AuthenticationResponseJSON` shape. */
export function passkeySignInBody(opts: {
  credentialId: string;
  email: string;
  type?: 'authentication' | 'mfa';
  challenge?: string;
}) {
  return {
    assertion: passkeyAssertion({ credentialId: opts.credentialId, challenge: opts.challenge }),
    type: opts.type ?? 'authentication',
    email: opts.email,
  };
}

/** WebAuthn assertion with base64url fields. */
export function passkeyAssertion(opts: { credentialId: string; challenge?: string } = { credentialId: nanoid(32) }) {
  const clientData = JSON.stringify({
    type: 'webauthn.get',
    challenge: opts.challenge ?? nanoid(32),
    origin: 'http://localhost:3000',
    crossOrigin: false,
  });
  return {
    id: opts.credentialId,
    rawId: opts.credentialId,
    response: {
      clientDataJSON: Buffer.from(clientData).toString('base64url'),
      authenticatorData: Buffer.from(new Uint8Array(37)).toString('base64url'),
      signature: Buffer.from(new Uint8Array(64)).toString('base64url'),
    },
    clientExtensionResults: {},
    type: 'public-key' as const,
  };
}

export async function createTestUser(email: string, verified = true) {
  const userRecord = mockUser({ email });
  const [user] = await db.insert(usersTable).values(userRecord).returning();

  const unsubscribeTokenRecord = await mockUnsubscribeToken(user);
  await db.insert(unsubscribeTokensTable).values(unsubscribeTokenRecord).onConflictDoNothing();

  const emailRecord = {
    email: user.email,
    userId: user.id,
    verified,
    verifiedAt: verified ? mockPastIsoDate() : null,
  };
  await db.insert(emailsTable).values(emailRecord);

  return user;
}

export async function getUserByEmail(email: string): Promise<UserModel[]> {
  return await db.select().from(usersTable).where(eq(usersTable.email, email));
}

export async function enableMFAForUser(userId: string) {
  await db.update(usersTable).set({ mfaRequired: true }).where(eq(usersTable.id, userId));
}

export async function verifyUserEmail(email: string) {
  await db
    .update(emailsTable)
    .set({ verified: true, verifiedAt: mockPastIsoDate() })
    .where(eq(emailsTable.email, email.toLowerCase()));
}

export async function createSystemAdminUser(email: string, verified = true) {
  const user = await createTestUser(email, verified);

  await db.insert(systemRolesTable).values({
    id: user.id,
    userId: user.id,
    role: 'admin',
    createdAt: mockPastIsoDate(),
  });

  return user;
}

export async function createOrganizationAdminUser(
  email: string,
  organizationId?: string,
  role: EntityRole = 'admin',
  verified = true,
  tenantId = 'test01', // Default test tenant
) {
  const user = await createTestUser(email, verified);

  const membership = {
    id: generateId(),
    userId: user.id,
    channelId: organizationId || '',
    organizationId: organizationId || '',
    tenantId,
    channelType: 'organization' as const,
    role,
    displayOrder: 1,
    createdAt: mockPastIsoDate(),
    createdBy: user.id,
  };

  await db.insert(membershipsTable).values([membership]);

  return user;
}

export async function parseResponse<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

/** The tenant is created first; the FK constraint requires it. */
export async function createTestOrganization(
  overrides?: Partial<ReturnType<typeof mockOrganization>>,
): Promise<OrganizationModel> {
  const [tenant] = await db.insert(tenantsTable).values({ name: 'Test Tenant' }).returning();

  const orgData = mockOrganization();
  const [organization] = await db
    .insert(organizationsTable)
    .values({ ...orgData, ...overrides, tenantId: tenant.id })
    .returning();

  return organization;
}

/** Inserts a session row and returns the cookie string for test requests. */
export async function createTestSession(user: { id: string }) {
  const sessionToken = nanoid(40);
  const hashedSessionToken = hashToken(sessionToken);
  const sessionId = generateId();

  await db.insert(sessionsTable).values({
    id: sessionId,
    secret: hashedSessionToken,
    userId: user.id,
    type: 'regular',
    authStrategy: 'passkey',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  });

  const cookieContent = `${hashedSessionToken}.${sessionId}.`;
  return `${authCookieName('session')}=${cookieContent}`;
}
