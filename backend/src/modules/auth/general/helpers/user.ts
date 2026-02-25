import { and, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { appConfig } from 'shared';
import { nanoid } from 'shared/nanoid';
import { baseDb as db } from '#/db/db';
import { emailsTable } from '#/db/schema/emails';
import { inactiveMembershipsTable } from '#/db/schema/inactive-memberships';
import { tokensTable } from '#/db/schema/tokens';
import { unsubscribeTokensTable } from '#/db/schema/unsubscribe-tokens';
import { type InsertUserModel, type UserModel, usersTable } from '#/db/schema/users';
import { AppError } from '#/lib/error';
import { checkSlugAvailable } from '#/modules/entities/helpers/check-slug';
import { getIsoDate } from '#/utils/iso-date';
import { generateUnsubscribeToken } from '#/utils/unsubscribe-token';

interface HandleCreateUserProps {
  newUser: InsertUserModel;
  inactiveMembershipId?: string | null;
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
  const slugAvailable = await checkSlugAvailable(newUser.slug, db);

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

    await db
      .insert(unsubscribeTokensTable)
      .values({ secret: generateUnsubscribeToken(normalizedEmail), userId: user.id });

    // If user has invitation tokens, find the inactive membership from it
    const existingTokens = await db
      .select()
      .from(tokensTable)
      .where(
        and(
          eq(tokensTable.email, normalizedEmail),
          eq(tokensTable.type, 'invitation'),
          isNull(tokensTable.userId),
          isNotNull(tokensTable.inactiveMembershipId),
        ),
      )
      .limit(1);

    // If there are existing invitation tokens, set the user ID on the associated inactive memberships
    if (existingTokens.length > 0) {
      await handleSetUserOnInactiveMemberships(
        user.id,
        existingTokens.map((t) => t.inactiveMembershipId!),
      );
    }

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
    throw new AppError(409, 'email_exists', 'warn');
  }
};

/**
 * Handles updating inactive memberships with the new user ID upon user creation.
 * Deletes associated tokens after updating the memberships.
 *
 * @param userId - The ID of the newly created user.
 * @param inactiveMembershipIds - The IDs of the inactive memberships to update.
 */
export const handleSetUserOnInactiveMemberships = async (userId: string, inactiveMembershipIds: string[]) => {
  await db
    .update(inactiveMembershipsTable)
    .set({ userId })
    .where(inArray(inactiveMembershipsTable.id, inactiveMembershipIds));

  // Delete associated tokens
  await db.delete(tokensTable).where(inArray(tokensTable.inactiveMembershipId, inactiveMembershipIds));
};
