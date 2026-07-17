import { and, eq, isNull } from 'drizzle-orm';
import type { Context } from 'hono';
import { nanoid } from 'shared/utils/nanoid';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb as db } from '#/db/db';
import { getAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { getParsedSessionCookie, validateSession } from '#/modules/auth/general/helpers/session';
import { type TokenModel, tokensTable } from '#/modules/auth/tokens-db';
import { hashToken } from '#/utils/hash-token';
import { isExpiredDate } from '#/utils/is-expired-date';
import { createDate, TimeSpan } from '#/utils/time-span';

type BaseProps = {
  ctx: Context<Env>;
  token: string;
  tokenType: TokenModel['type'];
  invokeToken?: boolean;
};
/**
 * Validates a token by value, ensuring it matches the required type and is neither expired nor invoked.
 * Invokes (consumes) the token on success by default.
 *
 * @param invokeToken When true, mints a fresh single-use token after consuming the primary `token`.
 * @throws AppError if the token is not found, expired, or of an invalid type.
 */
export const getValidToken = async ({ ctx, token, tokenType, invokeToken = true }: BaseProps): Promise<TokenModel> => {
  // Hash token
  const hashedToken = hashToken(token);

  // Get token row that matches (possibly invoked) token
  const [tokenRecord] = await db
    .select()
    .from(tokensTable)
    .where(and(eq(tokensTable.secret, hashedToken), eq(tokensTable.type, tokenType)))
    .limit(1);

  if (!tokenRecord) throw new AppError(401, `${tokenType}_not_found`, 'warn');

  // If token doesn't match a possible existing auth session, abort
  let existingSessionToken: string | null = null;
  try {
    const { sessionToken } = await getParsedSessionCookie(ctx);
    existingSessionToken = sessionToken;
  } catch (err) {}
  if (existingSessionToken) {
    // Get user from valid session
    const { user } = await validateSession(existingSessionToken);
    if (user?.id && tokenRecord.userId !== user.id) throw new AppError(400, 'user_mismatch', 'warn');
  }

  // Token expired
  if (isExpiredDate(tokenRecord.expiresAt)) {
    throw new AppError(401, `${tokenRecord.type}_expired`, 'warn');
  }

  // If token already invoked but not expired, last resort is to check if user still has the single use token session
  // If that isnt present anymore, we consider the token expired anyways
  if (tokenRecord.invokedAt) {
    const singleUseToken = await getAuthCookie(ctx, tokenType);
    if (!singleUseToken) throw new AppError(401, `${tokenRecord.type}_expired`, 'warn');
  }

  // Create single use session token, mark token as invoked, and update expiresAt to 5 min from now.
  // The transition is a compare-and-swap on `invokedAt IS NULL` so two concurrent redemptions of the
  // same primary token cannot both mint a session. Exactly one wins the update.
  if (invokeToken) {
    const rawSingleUseToken = nanoid(40);
    const [invokedTokenRecord] = await db
      .update(tokensTable)
      .set({
        // Store the HASH at rest; the raw value lives only in the caller's short-lived cookie, so a
        // DB read never reveals a usable single-use token.
        singleUseToken: hashToken(rawSingleUseToken),
        invokedAt: new Date().toISOString(),
        expiresAt: createDate(new TimeSpan(5, 'm')),
      })
      .where(and(eq(tokensTable.id, tokenRecord.id), isNull(tokensTable.invokedAt)))
      .returning();

    // CAS won: hand the RAW single-use token back so the caller can set the cookie.
    if (invokedTokenRecord) return { ...invokedTokenRecord, singleUseToken: rawSingleUseToken };

    // CAS lost → the token was already invoked (a concurrent double-submit or a legitimate re-click).
    // Tolerate only if the caller still presents a valid single-use cookie; otherwise it is spent.
    // Return without a raw `singleUseToken` (null) so the caller does NOT mint/re-set a cookie.
    const singleUseCookie = await getAuthCookie(ctx, tokenType);
    if (!singleUseCookie) throw new AppError(401, `${tokenRecord.type}_expired`, 'warn');
    return { ...tokenRecord, singleUseToken: null };
  }

  return tokenRecord;
};
