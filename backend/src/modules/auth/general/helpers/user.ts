import { appConfig } from 'shared';
import { nanoid } from 'shared/utils/nanoid';
import type { DbContext } from '#/core/context';
import { AppError } from '#/core/error';
import { extractPgError } from '#/lib/error';
import { checkSlugAvailable } from '#/modules/entities/helpers/check-slug';
import { emailsTable } from '#/modules/user/emails-db';
import { unsubscribeTokensTable } from '#/modules/user/unsubscribe-tokens-db';
import { type InsertUserModel, type UserModel, usersTable } from '#/modules/user/user-db';
import { getIsoDate } from '#/utils/iso-date';
import { generateUnsubscribeToken } from '#/utils/unsubscribe-token';

/** Unique constraints on a user's address: `users.email` and `emails.email`. */
const addressConstraints = new Set(['users_email_key', 'emails_email_key']);

interface HandleCreateUserProps {
  newUser: InsertUserModel;
  inactiveMembershipId?: string | null;
  emailVerified?: boolean;
}

/**
 * Creates a user (also the OAuth sign-up path): user, unsubscribe token and an unverified email row. Pending invitations
 * for the address are claimed at the first inbox proof, never here: typing someone's address into sign-up proves nothing.
 * Throws 409 `email_exists` when the address is taken.
 */
export const handleCreateUser = async (
  ctx: DbContext,
  { newUser, emailVerified }: HandleCreateUserProps,
): Promise<UserModel> => {
  const { db } = ctx.var;
  const slugAvailable = await checkSlugAvailable(ctx, newUser.slug, 'user');

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

    // The account's one email row, with verification state from the sign-up strategy. A taken address never gets here:
    // the users insert above already failed on its unique email.
    await db.insert(emailsTable).values({
      email: normalizedEmail,
      userId: user.id,
      verified: emailVerified,
      ...(emailVerified && { verifiedAt: getIsoDate() }),
    });

    return user;
  } catch (error) {
    // A taken address is the one conflict to name here. Anything else (a failed claim, a slug race, bad input)
    // surfaces as what it is.
    const pgError = extractPgError(error);
    if (pgError?.code === '23505' && addressConstraints.has(pgError.constraint ?? '')) {
      throw new AppError(409, 'email_exists', 'warn');
    }
    throw error;
  }
};
