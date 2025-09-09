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
export const initiateMultiFactorAuth = async (ctx: Context, user: UserModel) => {
  // If the user does not have MFA enabled, do nothing
  if (!user.multiFactorRequired) return null;

  // Generate a new random token and insert it
  const [{ token: generatedTokenId }] = await db
    .insert(tokensTable)
    .values({
      token: nanoid(40),
      type: 'confirm_mfa',
      userId: user.id,
      email: user.email,
      createdBy: user.id,
      expiresAt: createDate(new TimeSpan(10, 'm')), // token expires in 10 minutes
    })
    .returning({ token: tokensTable.id });

  // Set a temporary auth cookie to track confirm MFA session
  await setAuthCookie(ctx, 'confirm-mfa', generatedTokenId, new TimeSpan(10, 'm'));

  // Return the path to redirect the user to MFA confirmation page
  return `/auth/authenticate?mfa=${true}`;
};

/**
 * Validates a confirm MFA token from cookie and optionally deletes it.
 *
 * @param ctx - Hono context
 * @param consumeToken - If true, deletes token from DB and cookie after validation
 * @returns UserModel
 * @throws AppError if token is missing, not found, or expired
 */
export const validateConfirmMFAToken = async (ctx: Context, consumeToken = true): Promise<UserModel> => {
  // Get token ID from cookie
  const tokenIdFromCookie = await getAuthCookie(ctx, 'confirm-mfa');
  if (!tokenIdFromCookie) throw new AppError({ status: 401, type: 'invalid_credentials', severity: 'error' });

  // Fetch token record and associated user
  const tokenRecord = await getValidToken({ requiredType: 'confirm_mfa', consumeToken, tokenId: tokenIdFromCookie });

  if (!tokenRecord.userId) throw new AppError({ status: 404, type: 'confirm_mfa_not_found', severity: 'warn' });

  const [user] = await usersBaseQuery().where(eq(usersTable.id, tokenRecord.userId)).limit(1);

  if (!user) throw new AppError({ status: 404, type: 'confirm_mfa_not_found', severity: 'warn' });

  // Delete cookie if requested
  if (consumeToken) deleteAuthCookie(ctx, 'confirm-mfa');

  return user;
};
