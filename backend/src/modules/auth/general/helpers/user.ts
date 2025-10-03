import { appConfig } from 'config';
import { and, eq } from 'drizzle-orm';
import { db } from '#/db/db';
import { emailsTable } from '#/db/schema/emails';
import { unsubscribeTokensTable } from '#/db/schema/unsubscribe-tokens';
import { type InsertUserModel, type UserModel, usersTable } from '#/db/schema/users';
import { AppError } from '#/lib/errors';
import { checkSlugAvailable } from '#/modules/entities/helpers/check-slug';
import { getIsoDate } from '#/utils/iso-date';
import { nanoid } from '#/utils/nanoid';
import { generateUnsubscribeToken } from '#/utils/unsubscribe-token';

interface HandleCreateUserProps {
  newUser: InsertUserModel;
  emailVerified?: boolean;
}

/**
 * Handles user creation, including password or OAuth-based sign-up.
 * Inserts the user into the database, processes OAuth accounts, and sends verification emails.
 * Sets a user session upon successful sign-up.
 *
 * @param newUser - New user data for registration(InsertUserModel).
 * @param emailVerified - Optional, new user email verified.
 * @returns Error response or Redirect response or Response
 */
export const handleCreateUser = async ({ newUser, emailVerified }: HandleCreateUserProps): Promise<UserModel> => {
  // Check if slug is available
  const slugAvailable = await checkSlugAvailable(newUser.slug);

  // Insert new user into database
  try {
    const normalizedEmail = newUser.email.toLowerCase().trim();

    const [user] = await db
      .insert(usersTable)
      .values({
        slug: slugAvailable ? newUser.slug : `${newUser.slug}-${nanoid(5)}`,
        firstName: newUser.firstName,
        email: normalizedEmail,
        name: newUser.name,
        language: appConfig.defaultLanguage,
      })
      .returning();

    await db.insert(unsubscribeTokensTable).values({ token: generateUnsubscribeToken(normalizedEmail), userId: user.id });

    // If email is verified, create verified email record
    if (emailVerified) {
      // Delete any unverified email under a different user
      await db.delete(emailsTable).where(and(eq(emailsTable.email, normalizedEmail), eq(emailsTable.verified, false)));

      // Insert new email entry
      await db.insert(emailsTable).values({
        email: normalizedEmail,
        userId: user.id,
        verified: true,
        verifiedAt: getIsoDate(),
      });
    }

    return user;
  } catch (error) {
    // If user with this email already exists, return an error
    throw new AppError({ status: 409, type: 'email_exists', severity: 'warn' });
  }
};
