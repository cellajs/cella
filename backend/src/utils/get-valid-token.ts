import { and, eq } from 'drizzle-orm';
import { Context } from 'hono';
import { db } from '#/db/db';
import { type TokenModel, tokensTable } from '#/db/schema/tokens';
import { Env } from '#/lib/context';
import { AppError } from '#/lib/errors';
import { getAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { getParsedSessionCookie, validateSession } from '#/modules/auth/general/helpers/session';
import { isExpiredDate } from '#/utils/is-expired-date';
import { nanoid } from '#/utils/nanoid';
import { encodeLowerCased } from '#/utils/oslo';
import { createDate, TimeSpan } from '#/utils/time-span';

type BaseProps = {
  ctx: Context<Env>;
  token: string;
  tokenType: TokenModel['type'];
  invokeToken?: boolean;
  redirectPath?: string;
};
/**
 * Validates a token by its value, ensuring it matches the required type and is neither expired nor invoked.
 * By default, it invokes the token upon successful validation.
 *
 * @param ctx - Hono context.
 * @param token The token string to validate.
 * @param invokeToken (optional) Whether to create a single-use token after invoking/consuming the primary `token`.
 * @param tokenType The required type of the token (e.g., 'password-reset', 'email-verification').
 * @param isRedirect - Whether error requests should be redirects.
 * @returns The valid token record from the database.
 * @throws AppError if the token is not found, expired, or of an invalid type.
 */
export const getValidToken = async ({ ctx, token, tokenType, invokeToken = true, redirectPath }: BaseProps): Promise<TokenModel> => {
  // Hash token
  const hashedToken = encodeLowerCased(token);

  // Get token record that matches (possibly invoked) token
  let [tokenRecord] = await db
    .select()
    .from(tokensTable)
    .where(and(eq(tokensTable.token, hashedToken), eq(tokensTable.type, tokenType)))
    .limit(1);

  if (!tokenRecord) throw new AppError({ status: 401, type: `${tokenType}_not_found`, severity: 'warn', redirectPath });

  // If token doesn't match a possible existing auth session, abort
  let existingSessionToken: string | null = null;
  try {
    const { sessionToken } = await getParsedSessionCookie(ctx, { redirectOnError: redirectPath });
    existingSessionToken = sessionToken;
  } catch (err) {}
  if (existingSessionToken) {
    // Get user from valid session
    const { user } = await validateSession(existingSessionToken);
    if (user?.id && tokenRecord.userId !== user.id) throw new AppError({ status: 400, type: 'user_mismatch', severity: 'warn', redirectPath });
  }

  // Token expired
  if (isExpiredDate(tokenRecord.expiresAt)) {
    throw new AppError({ status: 401, type: `${tokenRecord.type}_expired`, severity: 'warn', redirectPath });
  }

  // If token already invoked but not expired, last resort is to check if user still has the single use token session
  // If that isnt present anymore, we consider the token expired anyways
  if (tokenRecord.invokedAt) {
    const singleUseToken = await getAuthCookie(ctx, tokenType);
    if (!singleUseToken) throw new AppError({ status: 401, type: `${tokenRecord.type}_expired`, severity: 'warn', redirectPath });
  }

  // Create single use session token, mark token as invoked, and update expiresAt to 5 min from now
  if (invokeToken) {
    const [invokedTokenRecord] = await db
      .update(tokensTable)
      .set({ singleUseToken: nanoid(40), invokedAt: new Date(), expiresAt: createDate(new TimeSpan(5, 'm')) })
      .where(eq(tokensTable.id, tokenRecord.id))
      .returning();
    return invokedTokenRecord;
  }

  return tokenRecord;
};
