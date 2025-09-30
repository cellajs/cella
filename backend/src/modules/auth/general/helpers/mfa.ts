import { eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { db } from '#/db/db';
import { tokensTable } from '#/db/schema/tokens';
import { type UserModel, usersTable } from '#/db/schema/users';
import { Env } from '#/lib/context';
import { AppError } from '#/lib/errors';
import { deleteAuthCookie, getAuthCookie, setAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { usersBaseQuery } from '#/modules/users/helpers/select';
import { getValidToken } from '#/utils/get-valid-token';
import { nanoid } from '#/utils/nanoid';
import { createDate, TimeSpan } from '#/utils/time-span';

/**
 * Starts a two-factor authentication challenge for a user.
 * Generates a temporary token, stores it in the database,
 * and sets a confirm MFA auth cookie.
 *
 * @param ctx - Hono context
 * @param user - User to start MFA for
 * @returns Redirect path to MFA confirmation page, or null if MFA is not enabled
 */
export const initiateMfa = async (ctx: Context<Env>, user: UserModel) => {
  // If the user does not have MFA enabled, do nothing
  if (!user.mfaRequired) return null;

  const timespan = new TimeSpan(10, 'm');
  // Generate a new random token and insert it
  const [{ token: generatedToken }] = await db
    .insert(tokensTable)
    .values({
      token: nanoid(40),
      type: 'confirm-mfa',
      userId: user.id,
      email: user.email,
      createdBy: user.id,
      expiresAt: createDate(timespan), // token expires in 10 minutes
    })
    .returning({ token: tokensTable.token });

  // Set a temporary auth cookie to track confirm MFA session
  await setAuthCookie(ctx, 'confirm-mfa', generatedToken, timespan);

  // Return the path to redirect the user to MFA authentication page
  return '/auth/authenticate/mfa';
};

/**
 * Validates a confirm MFA token from cookie and optionally deletes it.
 *
 * @param ctx - Hono context
 * @returns UserModel
 * @throws AppError if token is missing, not found, or expired
 */
export const validateConfirmMfaToken = async (ctx: Context<Env>): Promise<UserModel> => {
  // TODO on error redirect?
  const tokenFromCookie = await getAuthCookie(ctx, 'confirm-mfa');
  if (!tokenFromCookie) throw new AppError({ status: 401, type: 'confirm-mfa_not_found', severity: 'error' });

  // Fetch token record and associated user
  const tokenRecord = await getValidToken({ ctx, token: tokenFromCookie, invokeToken: false, tokenType: 'confirm-mfa' });

  // Sanity check
  if (!tokenRecord.userId) throw new AppError({ status: 400, type: 'invalid_request', severity: 'error' });

  const [user] = await usersBaseQuery().where(eq(usersTable.id, tokenRecord.userId)).limit(1);
  if (!user) throw new AppError({ status: 404, type: 'not_found', entityType: 'user', severity: 'error' });

  return user;
};

/**
 * Consumes the MFA token stored in the 'confirm-mfa' cookie.
 * Marks it as used in the database and deletes the cookie.
 */
export const consumeMfaToken = async (ctx: Context<Env>): Promise<void> => {
  const tokenFromCookie = await getAuthCookie(ctx, 'confirm-mfa');
  if (!tokenFromCookie) return;

  // Fetch token record and associated user
  await getValidToken({ ctx, token: tokenFromCookie, tokenType: 'confirm-mfa' });

  // Delete cookie
  deleteAuthCookie(ctx, 'confirm-mfa');
};
