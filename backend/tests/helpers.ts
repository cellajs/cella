import { db } from '#/db/db';
import { eq } from 'drizzle-orm';
import { mockUser, mockEmail } from '../mocks/basic';
import { hashPassword } from '#/modules/auth/helpers/argon2id';
import { type UserModel, usersTable } from '#/db/schema/users';
import { emailsTable } from '#/db/schema/emails';

/**
 * Helper function to create a user in the database.
 * @param firstName - The first name of the user.
 * @param lastName - The last name of the user.
 * @param email - The email of the user.
 * @param password - The password of the user.
 * @returns 
 */
export async function createUser(email: string, password: string) {
  const hashed = await hashPassword(password);

  // Make user record → Insert into the database
  const userRecord = mockUser(hashed, { email });
  const [user] = await db
    .insert(usersTable)
    .values(userRecord)
    .returning()
    .onConflictDoNothing();

  // Make email record for user → Insert into the database
  const emailRecord = mockEmail(user);
  await db
    .insert(emailsTable)
    .values(emailRecord)
    .onConflictDoNothing();
};

/**
 * Helper function to retrieve a user by email from the database.
 * @param email - The email of the user to retrieve.
 * @returns 
 */
export async function getUserByEmail(email: string): Promise<UserModel[]> {
  return await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email))
}