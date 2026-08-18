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
 * @param invokeToken When true, mints a fresh single-use token after consuming the primary `token`.
 * @throws AppError if the token is not found, expired, or of an invalid type.
 */
export const getValidToken = async ({ ctx, token, tokenType, invokeToken = true }: BaseProps): Promise<TokenModel> => {
  const hashedToken = hashToken(token);

  // Matches an already invoked token too.
  const [tokenRecord] = await db
    .select()
    .from(tokensTable)
    .where(and(eq(tokensTable.secret, hashedToken), eq(tokensTable.type, tokenType)))
    .limit(1);

  if (!tokenRecord) throw new AppError(401, `${tokenType}_not_found`, 'warn');

  // Abort when the token belongs to a different user than the existing session.
  let existingSessionToken: string | null = null;
  try {
    const { sessionToken } = await getParsedSessionCookie(ctx);
    existingSessionToken = sessionToken;
  } catch (err) {}
  if (existingSessionToken) {
    const { user } = await validateSession(existingSessionToken);
    if (user?.id && tokenRecord.userId !== user.id) throw new AppError(400, 'user_mismatch', 'warn');
  }

  if (isExpiredDate(tokenRecord.expiresAt)) {
    throw new AppError(401, `${tokenRecord.type}_expired`, 'warn');
  }

  // Invoked but not expired: only a surviving single-use cookie keeps it usable.
  if (tokenRecord.invokedAt) {
    const singleUseToken = await getAuthCookie(ctx, tokenType);
    if (!singleUseToken) throw new AppError(401, `${tokenRecord.type}_expired`, 'warn');
  }

  // Compare-and-swap on `invokedAt IS NULL`: of two concurrent redemptions exactly one mints a session.
  if (invokeToken) {
    const rawSingleUseToken = nanoid(40);
    const [invokedTokenRecord] = await db
      .update(tokensTable)
      .set({
        // Hash at rest: the raw value lives only in the caller's short-lived cookie.
        singleUseToken: hashToken(rawSingleUseToken),
        invokedAt: new Date().toISOString(),
        expiresAt: createDate(new TimeSpan(5, 'm')),
      })
      .where(and(eq(tokensTable.id, tokenRecord.id), isNull(tokensTable.invokedAt)))
      .returning();

    // CAS won: hand the RAW single-use token back so the caller can set the cookie.
    if (invokedTokenRecord) return { ...invokedTokenRecord, singleUseToken: rawSingleUseToken };

    // CAS lost: tolerate only while the caller still presents a valid single-use cookie, otherwise it is spent.
    // Returning a null `singleUseToken` keeps the caller from re-setting the cookie.
    const singleUseCookie = await getAuthCookie(ctx, tokenType);
    if (!singleUseCookie) throw new AppError(401, `${tokenRecord.type}_expired`, 'warn');
    return { ...tokenRecord, singleUseToken: null };
  }

  return tokenRecord;
};
