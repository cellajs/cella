import { z } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';
import { db } from '#/db/db';
import { emailsTable } from '#/db/schema/emails';
import { membershipsTable } from '#/db/schema/memberships';
import { type OrganizationModel, organizationsTable } from '#/db/schema/organizations';
import { passwordsTable } from '#/db/schema/passwords';
import { systemRolesTable } from '#/db/schema/system-roles';
import { tenantsTable } from '#/db/schema/tenants';
import { unsubscribeTokensTable } from '#/db/schema/unsubscribe-tokens';
import { type UserModel, usersTable } from '#/db/schema/users';
import { hashPassword } from '#/modules/auth/passwords/helpers/argon2id';
import { apiErrorSchema } from '#/schemas';
import { mockOrganization } from '../mocks/mock-organization';
import { mockPassword, mockUnsubscribeToken, mockUser } from '../mocks/mock-user';
import { pastIsoDate } from '../mocks/utils';

/**
 * Types for test responses
 */
export type ErrorResponse = z.infer<typeof apiErrorSchema>;

/**
 * Create a user with password authentication
 */
export async function createPasswordUser(email: string, password: string, verified: boolean = true) {
  // Make user record → Insert into the database
  const userRecord = mockUser({ email });
  const [user] = await db.insert(usersTable).values(userRecord).returning();

  const hashed = await hashPassword(password);
  const passwordRecord = mockPassword(user, hashed);
  await db.insert(passwordsTable).values(passwordRecord);

  // Make unsubscribeToken record → Insert into the database
  const unsubscribeTokenRecord = mockUnsubscribeToken(user);
  await db.insert(unsubscribeTokensTable).values(unsubscribeTokenRecord).onConflictDoNothing();

  // Make email record for user → Insert into the database
  const emailRecord = {
    email: user.email,
    userId: user.id,
    verified,
    verifiedAt: verified ? pastIsoDate() : null,
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
    .set({ verified: true, verifiedAt: pastIsoDate() })
    .where(eq(emailsTable.email, email.toLowerCase()));
}

/**
 * Create a system admin user with password authentication
 */
export async function createSystemAdminUser(email: string, password: string, verified: boolean = true) {
  // Create regular user first
  const user = await createPasswordUser(email, password, verified);

  // Assign system admin role
  await db.insert(systemRolesTable).values({
    id: user.id,
    userId: user.id,
    role: 'admin',
    createdAt: pastIsoDate(),
  });

  return user;
}

/**
 * Create an organization admin user with password authentication
 */
export async function createOrganizationAdminUser(
  email: string,
  password: string,
  organizationId: string,
  role: 'admin' | 'member' = 'admin',
  verified: boolean = true,
  tenantId: string = 'test01', // Default test tenant
) {
  // Create regular user first
  const user = await createPasswordUser(email, password, verified);

  // Create organization membership
  const membership = {
    id: `membership-${user.id}`,
    userId: user.id,
    organizationId,
    tenantId,
    contextType: 'organization' as const,
    role,
    displayOrder: 1,
    createdAt: pastIsoDate(),
    createdBy: user.id,
  };

  await db.insert(membershipsTable).values(membership);

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
