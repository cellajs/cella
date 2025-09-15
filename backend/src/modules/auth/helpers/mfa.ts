import { eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { db } from '#/db/db';
import { tokensTable } from '#/db/schema/tokens';
import { type UserModel, usersTable } from '#/db/schema/users';
import { AppError } from '#/lib/errors';
import { deleteAuthCookie, getAuthCookie, setAuthCookie } from '#/modules/auth/helpers/cookie';
import { usersBaseQuery } from '#/modules/users/helpers/select';
import { nanoid } from '#/utils/nanoid';
import { createDate, TimeSpan } from '#/utils/time-span';
import { getValidToken } from '#/utils/validate-token';

/**
 * Starts a two-factor authentication challenge for a user.
 * Generates a temporary token, stores it in the database,
 * and sets a confirm MFA auth cookie.
 *
 * @param ctx - Hono context
 * @param user - User to start MFA for
 * @returns Redirect path to MFA confirmation page, or null if MFA is not enabled
 */
export const initiateMfa = async (ctx: Context, user: UserModel) => {
  // If the user does not have MFA enabled, do nothing
  if (!user.mfaRequired) return null;

  const timespan = new TimeSpan(10, 'm');
  // Generate a new random token and insert it
  const [{ token: generatedTokenId }] = await db
    .insert(tokensTable)
    .values({
      token: nanoid(40),
      type: 'confirm_mfa',
      userId: user.id,
      email: user.email,
      createdBy: user.id,
      expiresAt: createDate(timespan), // token expires in 10 minutes
    })
    .returning({ token: tokensTable.id });

  // Set a temporary auth cookie to track confirm MFA session
  await setAuthCookie(ctx, 'confirm-mfa', generatedTokenId, timespan);

  // Return the path to redirect the user to MFA confirmation page
  return '/auth/authenticate/mfa-confirmation';
};

/**
 * Validates a confirm MFA token from cookie and optionally deletes it.
 *
 * @param ctx - Hono context
 * @returns UserModel
 * @throws AppError if token is missing, not found, or expired
 */
export const validateConfirmMfaToken = async (ctx: Context): Promise<UserModel> => {
  // Get token ID from cookie
  const tokenIdFromCookie = await getAuthCookie(ctx, 'confirm-mfa');
  if (!tokenIdFromCookie) throw new AppError({ status: 401, type: 'invalid_credentials', severity: 'error' });

  // Fetch token record and associated user
  const tokenRecord = await getValidToken({ requiredType: 'confirm_mfa', consumeToken: false, tokenId: tokenIdFromCookie });

  if (!tokenRecord.userId) throw new AppError({ status: 404, type: 'confirm_mfa_not_found', severity: 'warn' });

  const [user] = await usersBaseQuery().where(eq(usersTable.id, tokenRecord.userId)).limit(1);

  if (!user) throw new AppError({ status: 404, type: 'confirm_mfa_not_found', severity: 'warn' });

  return user;
};

/**
 * Consumes the MFA token stored in the 'confirm-mfa' cookie.
 * Marks it as used in the database and deletes the cookie.
 */
export const consumemMfaToken = async (ctx: Context): Promise<void> => {
  const tokenIdFromCookie = await getAuthCookie(ctx, 'confirm-mfa');
  if (!tokenIdFromCookie) return;

  const [tokenRecord] = await db.select().from(tokensTable).where(eq(tokensTable.id, tokenIdFromCookie)).limit(1);
  if (!tokenRecord) return;

  // Mark token as consumed
  await db.update(tokensTable).set({ consumedAt: new Date() }).where(eq(tokensTable.id, tokenRecord.id));

  // Delete cookie
  deleteAuthCookie(ctx, 'confirm-mfa');
};
