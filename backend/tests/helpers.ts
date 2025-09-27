import { db } from '#/db/db';
import { emailsTable } from '#/db/schema/emails';
import { passwordsTable } from '#/db/schema/passwords';
import { unsubscribeTokensTable } from '#/db/schema/unsubscribe-tokens';
import { type UserModel, usersTable } from '#/db/schema/users';
import { hashPassword } from '#/modules/auth/passwords/helpers/argon2id';
import { eq } from 'drizzle-orm';
import { mockEmail, mockPassword, mockUnsubscribeToken, mockUser } from '../mocks/basic';

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
  const userRecord = mockUser({ email });
  const [user] = await db
    .insert(usersTable)
    .values(userRecord)
    .returning()
    .onConflictDoNothing();

  // Make password record for each user → Insert into the database
  const passwordRecord = mockPassword(user, hashed);
  await db.insert(passwordsTable).values(passwordRecord).onConflictDoNothing();

  // Make unsubscribeToken record → Insert into the database
  const unsubscribeTokenRecord = mockUnsubscribeToken(user);
  await db.insert(unsubscribeTokensTable).values(unsubscribeTokenRecord).onConflictDoNothing();
    

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
// TODO not used anymore?
export async function getUserByEmail(email: string): Promise<UserModel[]> {
  return await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email))
}