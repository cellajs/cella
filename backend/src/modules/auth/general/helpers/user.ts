import { appConfig } from 'config';
import { and, eq } from 'drizzle-orm';
import { db } from '#/db/db';
import { emailsTable } from '#/db/schema/emails';
import { tokensTable } from '#/db/schema/tokens';
import { unsubscribeTokensTable } from '#/db/schema/unsubscribe-tokens';
import { type InsertUserModel, type UserModel, usersTable } from '#/db/schema/users';
import { resolveEntity } from '#/lib/entity';
import { AppError } from '#/lib/errors';
import { checkSlugAvailable } from '#/modules/entities/helpers/check-slug';
import { insertMemberships } from '#/modules/memberships/helpers';
import { getIsoDate } from '#/utils/iso-date';
import { logError } from '#/utils/logger';
import { nanoid } from '#/utils/nanoid';
import { generateUnsubscribeToken } from '#/utils/unsubscribe-token';
import { inactiveMembershipsTable } from '#/db/schema/inactive-memberships';

interface HandleCreateUserProps {
  newUser: InsertUserModel;
  membershipInviteTokenId?: string | null;
  emailVerified?: boolean;
}

/**
 * Handles user creation, including password or OAuth-based sign-up.
 * Inserts the user into the database, processes OAuth accounts, and sends verification emails.
 * Sets a user session upon successful sign-up.
 *
 * @param newUser - New user data for registration(InsertUserModel).
 * @param membershipInviteTokenId - Optional, token ID to associate with the new user.
 * @param emailVerified - Optional, new user email verified.
 * @returns Error response or Redirect response or Response
 */
export const handleCreateUser = async ({ newUser, membershipInviteTokenId, emailVerified }: HandleCreateUserProps): Promise<UserModel> => {
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

    // If signing up with token, update it with new user id and insert membership if applicable
    if (membershipInviteTokenId) await handleMembershipTokenUpdate(user.id, membershipInviteTokenId);

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

export const handleMembershipTokenUpdate = async (userId: string, tokenId: string) => {
  try {
    // Update the token with the new userId
    const [token] = await db.update(tokensTable).set({ userId }).where(eq(tokensTable.id, tokenId)).returning();

    const [inactiveMembership] = await db.select().from(inactiveMembershipsTable).where(eq(inactiveMembershipsTable.tokenId, tokenId));
    if (!inactiveMembership) throw new Error('No inactive memberships found for token.');

    const entityIdField = appConfig.entityIdFields[inactiveMembership.contextType];
    // Validate if the token contains the required entity ID field
    if (!token[entityIdField]) throw new Error(`Token is missing entity ID field for ${inactiveMembership.contextType}.`);

    const entity = await resolveEntity(inactiveMembership.contextType, token[entityIdField]);
    // If the entity cannot be found, throw an error
    if (!entity) throw new Error(`Unable to resolve entity (${inactiveMembership.contextType}) using the token's entity ID.`);

    // Insert membership for user into entity, but not yet activated
    await insertMemberships([{ userId, role: inactiveMembership.role, entity }]);
  } catch (error) {
    logError('Error inserting membership from token data', error);
    throw error;
  }
};
