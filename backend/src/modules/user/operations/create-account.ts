import { appConfig } from 'shared';
import { nanoid } from 'shared/utils/nanoid';
import type { DbContext } from '#/core/context';
import { AppError } from '#/core/error';
import { extractPgError } from '#/lib/error';
import { checkSlugAvailable } from '#/modules/entities/operations/check-slug';
import type { EmailProof } from '#/modules/user/emails-db';
import { claimEmailForUser } from '#/modules/user/operations/claim-email';
import type { InsertUserModel, UserModel } from '#/modules/user/user-db';
import { insertEmail, insertUsers } from '#/modules/user/user-queries';

/**
 * A unique violation on a user's address, on `users.email` or `emails.email`. Matched on the table and column part of
 * the constraint name, since the suffix differs between databases (`_key` from Postgres, `_unique` from older schemas).
 */
const isAddressConstraint = (constraint = '') => /^(users|emails)_email_/.test(constraint);

interface HandleCreateUserProps {
  newUser: InsertUserModel;
  /** What proved the inbox before the account is created: a magic-link click, or a provider's verification mail. */
  via: EmailProof;
}

/**
 * Creates an account for a proven inbox, in the caller's transaction: the user, its email row verified `via` the
 * proof, and the invitations waiting for the address bound to it. No path creates an account without a proof: an
 * unproven account would hold its address hostage, and nothing sweeps such accounts up.
 * Throws 409 `email_exists` when the address is taken.
 */
export const handleCreateUser = async (ctx: DbContext, { newUser, via }: HandleCreateUserProps): Promise<UserModel> => {
  const slugAvailable = await checkSlugAvailable(ctx, newUser.slug, 'user');

  try {
    const normalizedEmail = newUser.email.toLowerCase().trim();

    const [user] = await insertUsers(ctx, {
      users: [
        {
          slug: slugAvailable ? newUser.slug : `${newUser.slug}-${nanoid(5)}`,
          firstName: newUser.firstName,
          email: normalizedEmail,
          name: newUser.name,
          language: appConfig.defaultLanguage,
        },
      ],
    });

    // The account's one email row, proven at creation. A taken address never gets here: the users insert above
    // already failed on its unique email.
    await insertEmail(ctx, { userId: user.id, email: normalizedEmail, via });
    await claimEmailForUser(ctx, { userId: user.id, email: normalizedEmail });

    return user;
  } catch (error) {
    // A taken address is the one conflict to name here. Anything else (a failed claim, a slug race, bad input)
    // surfaces as what it is.
    const pgError = extractPgError(error);
    if (pgError?.code === '23505' && isAddressConstraint(pgError.constraint)) {
      throw new AppError(409, 'email_exists', 'warn');
    }
    throw error;
  }
};
