import { and, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { appConfig } from 'shared';
import { nanoid } from 'shared/utils/nanoid';
import type { DbContext } from '#/core/context';
import { AppError } from '#/core/error';
import { tokensTable } from '#/modules/auth/tokens-db';
import { checkSlugAvailable } from '#/modules/entities/helpers/check-slug';
import { inactiveMembershipsTable } from '#/modules/memberships/inactive-memberships-db';
import { emailsTable } from '#/modules/user/emails-db';
import { unsubscribeTokensTable } from '#/modules/user/unsubscribe-tokens-db';
import { type InsertUserModel, type UserModel, usersTable } from '#/modules/user/user-db';
import { getIsoDate } from '#/utils/iso-date';
import { generateUnsubscribeToken } from '#/utils/unsubscribe-token';

interface HandleCreateUserProps {
  newUser: InsertUserModel;
  inactiveMembershipId?: string | null;
  emailVerified?: boolean;
}

/**
 * Creates a user (also the OAuth sign-up path): inserts the user, unsubscribe token, and email row,
 * links any pending invitation tokens to their inactive memberships. Throws 409 if the email exists.
 */
export const handleCreateUser = async (
  ctx: DbContext,
  { newUser, emailVerified }: HandleCreateUserProps,
): Promise<UserModel> => {
  const { db } = ctx.var;
  // Check if slug is available
  const slugAvailable = await checkSlugAvailable(ctx, newUser.slug, 'user');

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
      await handleSetUserOnInactiveMemberships(ctx, {
        userId: user.id,
        inactiveMembershipIds: existingTokens.map((t) => t.inactiveMembershipId!),
      });
    }

    // Delete any unverified email under a different user
    await db.delete(emailsTable).where(and(eq(emailsTable.email, normalizedEmail), eq(emailsTable.verified, false)));

    // Create the email row with verification state from the sign-up strategy.
    await db.insert(emailsTable).values({
      email: normalizedEmail,
      userId: user.id,
      verified: emailVerified,
      ...(emailVerified && { verifiedAt: getIsoDate() }),
    });

    return user;
  } catch (error) {
    // If user with this email already exists, return an error
    throw new AppError(409, 'email_exists', 'warn');
  }
};

/** Sets the new user's ID on their inactive memberships, then deletes the associated tokens. */
export const handleSetUserOnInactiveMemberships = async (
  ctx: DbContext,
  { userId, inactiveMembershipIds }: { userId: string; inactiveMembershipIds: string[] },
) => {
  const { db } = ctx.var;
  await db
    .update(inactiveMembershipsTable)
    .set({ userId })
    .where(inArray(inactiveMembershipsTable.id, inactiveMembershipIds));

  // Delete associated tokens
  await db.delete(tokensTable).where(inArray(tokensTable.inactiveMembershipId, inactiveMembershipIds));
};
