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
import { encodeLowerCased } from '#/utils/oslo';

/**
 * Types for test responses
 */
export type ErrorResponse = z.infer<typeof apiErrorSchema>;

/**
 * Create a user with a verified email.
 * Use for OAuth/passkey tests.
 */
export async function createUser(email: string) {
  const userRecord = mockUser({ email });
  const [user] = await db.insert(usersTable).values(userRecord).returning();
  await db.insert(emailsTable).values(mockEmail(user));
  return user;
}

/**
 * Create a confirm-mfa token for a user. Returns the raw token string for use in cookies.
 */
export async function createMfaToken(user: { id: string; email: string }) {
  const mfaToken = nanoid(40);
  const hashedMfaToken = encodeLowerCased(mfaToken);
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

/**
 * Create a user with TOTP + MFA enabled.
 */
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

/**
 * Build a passkey sign-in request body.
 */
export function passkeySignInBody(opts: {
  credentialId: string;
  email: string;
  type?: 'authentication' | 'mfa';
  challenge?: string;
}) {
  return {
    credentialId: opts.credentialId,
    clientDataJSON: JSON.stringify({
      type: 'webauthn.get',
      challenge: opts.challenge ?? nanoid(32),
      origin: 'http://localhost:3000',
      crossOrigin: false,
    }),
    authenticatorObject: new Uint8Array(37).toString(),
    signature: new Uint8Array(64).toString(),
    type: opts.type ?? 'authentication',
    email: opts.email,
  };
}

/**
 * Create a user with a verified email.
 */
export async function createTestUser(email: string, verified = true) {
  // Make user row, then insert into the database
  const userRecord = mockUser({ email });
  const [user] = await db.insert(usersTable).values(userRecord).returning();

  // Make unsubscribeToken row, then insert into the database
  const unsubscribeTokenRecord = await mockUnsubscribeToken(user);
  await db.insert(unsubscribeTokensTable).values(unsubscribeTokenRecord).onConflictDoNothing();

  // Make email row for user, then insert into the database
  const emailRecord = {
    email: user.email,
    userId: user.id,
    verified,
    verifiedAt: verified ? mockPastIsoDate() : null,
  };
  await db.insert(emailsTable).values(emailRecord);

  return user;
}

/**
 * Helper function to retrieve a user by email from the database.
 * @param email - The email of the user to retrieve.
 * @returns
 */
export async function getUserByEmail(email: string): Promise<UserModel[]> {
  return await db.select().from(usersTable).where(eq(usersTable.email, email));
}

/**
 * Enable MFA for a user
 */
export async function enableMFAForUser(userId: string) {
  await db.update(usersTable).set({ mfaRequired: true }).where(eq(usersTable.id, userId));
}

/**
 * Verify email for a user
 */
export async function verifyUserEmail(email: string) {
  await db
    .update(emailsTable)
    .set({ verified: true, verifiedAt: mockPastIsoDate() })
    .where(eq(emailsTable.email, email.toLowerCase()));
}

/**
 * Create a system admin user
 */
export async function createSystemAdminUser(email: string, verified = true) {
  // Create regular user first
  const user = await createTestUser(email, verified);

  // Assign system admin role
  await db.insert(systemRolesTable).values({
    id: user.id,
    userId: user.id,
    role: 'admin',
    createdAt: mockPastIsoDate(),
  });

  return user;
}

/**
 * Create an organization admin user
 */
export async function createOrganizationAdminUser(
  email: string,
  organizationId?: string,
  role: EntityRole = 'admin',
  verified = true,
  tenantId = 'test01', // Default test tenant
) {
  // Create regular user first
  const user = await createTestUser(email, verified);

  // Create organization membership
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

/**
 * Helper to parse auth response from API response
 */
export async function parseResponse<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

/**
 * Create an organization with its tenant (required for FK constraint).
 * Returns the created organization which includes tenantId.
 */
export async function createTestOrganization(
  overrides?: Partial<ReturnType<typeof mockOrganization>>,
): Promise<OrganizationModel> {
  // Create tenant first
  const [tenant] = await db.insert(tenantsTable).values({ name: 'Test Tenant' }).returning();

  // Create organization with tenant reference
  const orgData = mockOrganization();
  const [organization] = await db
    .insert(organizationsTable)
    .values({ ...orgData, ...overrides, tenantId: tenant.id })
    .returning();

  return organization;
}

/**
 * Create a test session directly in the database for a user.
 * Returns the cookie string to use in test requests.
 */
export async function createTestSession(user: { id: string }) {
  const sessionToken = nanoid(40);
  const hashedSessionToken = encodeLowerCased(sessionToken);
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
