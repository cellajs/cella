import { eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { db } from '#/db/db';
import { tokensTable } from '#/db/schema/tokens';
import { type UserModel, usersTable } from '#/db/schema/users';
import { AppError } from '#/lib/errors';
import { deleteAuthCookie, getAuthCookie, setAuthCookie } from '#/modules/auth/helpers/cookie';
import { userSelect } from '#/modules/users/helpers/select';
import { isExpiredDate } from '#/utils/is-expired-date';
import { nanoid } from '#/utils/nanoid';
import { createDate, TimeSpan } from '#/utils/time-span';

/**
 * Starts a two-factor authentication challenge for a user.
 * Generates a temporary token, stores it in the database,
 * and sets a pending 2FA auth cookie.
 *
 * @param ctx - Hono context
 * @param user - User to start 2FA for
 * @returns Redirect path to 2FA confirmation page, or null if 2FA is not enabled
 */
export const initiateTwoFactorAuth = async (ctx: Context, user: UserModel) => {
  // If the user does not have 2FA enabled, do nothing
  if (!user.twoFactorEnabled) return null;

  // Generate a new random token and insert it
  const [{ token: generatedTokenId }] = await db
    .insert(tokensTable)
    .values({
      token: nanoid(40),
      type: 'pending_2fa',
      userId: user.id,
      email: user.email,
      createdBy: user.id,
      expiresAt: createDate(new TimeSpan(10, 'm')), // token expires in 10 minutes
    })
    .returning({ token: tokensTable.id });

  // Set a temporary auth cookie to track pending 2FA session
  await setAuthCookie(ctx, 'pending-2fa', generatedTokenId, new TimeSpan(10, 'm'));

  // Return the path to redirect the user to the 2FA confirmation page
  return '/auth/2fa-confirm';
};

/**
 * Validates a pending 2FA token from cookie and optionally deletes it.
 *
 * @param ctx - Hono context
 * @param deleteAfter - If true, deletes token from DB and cookie after validation
 * @returns UserModel
 * @throws AppError if token is missing, not found, or expired
 */
export const validatePending2FAToken = async (ctx: Context, deleteAfter = false): Promise<UserModel> => {
  // Get token ID from cookie
  const tokenIdFromCookie = await getAuthCookie(ctx, 'pending-2fa');
  if (!tokenIdFromCookie) throw new AppError({ status: 401, type: 'invalid_credentials', severity: 'error' });

  // Fetch token record and associated user
  const [tokenRecord] = await db
    .select({ user: userSelect, tokenId: tokensTable.id, tokenExpiredAt: tokensTable.expiresAt })
    .from(tokensTable)
    .innerJoin(usersTable, eq(usersTable.id, tokensTable.userId))
    .where(eq(tokensTable.id, tokenIdFromCookie))
    .limit(1);
  if (!tokenRecord) throw new AppError({ status: 404, type: 'pending_2fa_not_found', severity: 'warn' });

  const { user, tokenId, tokenExpiredAt } = tokenRecord;

  // Check if the token has expired
  if (isExpiredDate(tokenExpiredAt)) throw new AppError({ status: 401, type: 'pending_2fa_expired', severity: 'warn' });

  // Delete token and cookie if requested
  if (deleteAfter) {
    await db.delete(tokensTable).where(eq(tokensTable.id, tokenId));
    deleteAuthCookie(ctx, 'session');
  }

  return user;
};
