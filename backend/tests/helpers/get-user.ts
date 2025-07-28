import { db } from '#/db/db';
import { eq } from 'drizzle-orm';
import { type UserModel, usersTable } from '../../src/db/schema/users';

/**
 * Helper function to retrieve a user by email from the database.
 * @param email - The email of the user to retrieve.
 * @returns 
 */
export async function getUserByEmail(email: string):Promise<UserModel[]> {
  return await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email))
}