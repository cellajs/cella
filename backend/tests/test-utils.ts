import { db } from '#/db/db';
import { usersTable } from '#/db/schema/users';
import { emailsTable } from '#/db/schema/emails';
import { passwordsTable } from '#/db/schema/passwords';
import { eq } from 'drizzle-orm';
import { mockUser, mockPassword } from '../mocks/basic';
import { pastIsoDate } from '../mocks/utils';
import { hashPassword } from '#/modules/auth/passwords/helpers/argon2id';
import { z } from '@hono/zod-openapi';
import { apiErrorSchema } from '#/utils/schema/error';
import { redirectResponseSchema } from '#/utils/schema/responses';

/**
 * Types for test responses
 */
export type AuthResponse = z.infer<typeof redirectResponseSchema>
export type ErrorResponse = z.infer<typeof apiErrorSchema>

/**
 * Create a user with password authentication
 */
export async function createPasswordUser(email: string, password: string, verified: boolean = true) {
  const userRecord = mockUser({ email });
  const [user] = await db
    .insert(usersTable)
    .values(userRecord)
    .returning();

  const hashed = await hashPassword(password);
  const passwordRecord = mockPassword(user, hashed);
  await db.insert(passwordsTable).values(passwordRecord);

  // Create email with specified verification status
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
 * Enable MFA for a user
 */
export async function enableMFAForUser(userId: string) {
  await db
    .update(usersTable)
    .set({ mfaRequired: true })
    .where(eq(usersTable.id, userId));
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
 * Helper to parse auth response from API response
 */
export async function parseResponse<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}