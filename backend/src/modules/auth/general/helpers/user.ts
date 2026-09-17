import { appConfig } from 'shared';
import { nanoid } from 'shared/utils/nanoid';
import type { DbContext } from '#/core/context';
import { AppError } from '#/core/error';
import { claimEmailForUser } from '#/modules/auth/general/helpers/claim-email';
import { checkSlugAvailable } from '#/modules/entities/helpers/check-slug';
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

/** Creates a user (also the OAuth sign-up path): user, unsubscribe token and email row, linking pending invitation tokens to their inactive memberships. Throws 409 if the email exists. */
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

    await claimEmailForUser(ctx, { userId: user.id, email: normalizedEmail });

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
    throw new AppError(409, 'email_exists', 'warn');
  }
};
