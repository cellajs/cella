import { db } from '#/db/db';
import { eq } from 'drizzle-orm';
import { faker } from '@faker-js/faker';
import { nanoid } from 'nanoid';
import slugify from 'slugify';
import { generateUnsubscribeToken } from '#/modules/users/helpers/unsubscribe-token';
import { hashPassword } from '#/modules/auth/helpers/argon2id';
import { pastIsoDate } from '../mocks/utils';
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
  const firstAndLastName = { firstName: faker.person.firstName(), lastName: faker.person.lastName() };
  const slug = slugify(faker.internet.username(firstAndLastName), { lower: true, strict: true });
  const hashed = await hashPassword(password);

  const user = {
    id: nanoid(),
    firstName: firstAndLastName.firstName,
    lastName: firstAndLastName.lastName,
    thumbnailUrl: null,
    language: 'en',
    name: faker.person.fullName(firstAndLastName),
    email,
    unsubscribeToken: generateUnsubscribeToken(email),
    hashedPassword: hashed,
    slug,
    newsletter: faker.datatype.boolean(),
    createdAt: pastIsoDate(),
  }

  await db.insert(usersTable).values(user);
  await db.insert(emailsTable).values({
    id: nanoid(),
    userId: user.id,
    email: user.email,
    verified: true,
    createdAt: pastIsoDate(),
  });
};

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