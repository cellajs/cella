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

/**
 * How long an opened token stays usable through its single-use cookie. An invitation gets longer: answering it can
 * include signing in to another account by magic link (a 15-minute link) and a two-factor challenge, and a shorter
 * window would expire the invitation in the middle of that.
 */
export const singleUseWindow = (tokenType: TokenModel['type']) =>
  new TimeSpan(tokenType === 'invitation' ? 30 : 5, 'm');

/**
 * Whether this browser holds the single-use cookie minted for this token. Any cookie of the token's type is not proof:
 * it can come from the holder's own link. Read fresh, as a concurrent redemption may have minted it after this request
 * read the row.
 */
const holdsSingleUse = async (ctx: Context<Env>, tokenType: TokenModel['type'], tokenId: string) => {
  const cookie = await getAuthCookie(ctx, tokenType);
  if (!cookie) return false;
  const [row] = await db
    .select({ singleUseToken: tokensTable.singleUseToken })
    .from(tokensTable)
    .where(eq(tokensTable.id, tokenId))
    .limit(1);
  return !!row?.singleUseToken && row.singleUseToken === hashToken(cookie);
};

type BaseProps = {
  ctx: Context<Env>;
  token: string;
  tokenType: TokenModel['type'];
  invokeToken?: boolean;
};
/**
 * @param invokeToken When true, mints a fresh single-use token after consuming the primary `token`, valid for {@link singleUseWindow}.
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

  // Abort when the token belongs to a different user than the existing session. An invitation not yet bound to
  // a user is the one exception: whoever holds it may open it while signed in and accept it as their own account.
  const isUnboundInvitation = tokenRecord.type === 'invitation' && tokenRecord.userId === null;
  let existingSessionToken: string | null = null;
  try {
    const { sessionToken } = await getParsedSessionCookie(ctx);
    existingSessionToken = sessionToken;
  } catch (err) {}
  if (existingSessionToken && !isUnboundInvitation) {
    const { user } = await validateSession(existingSessionToken);
    if (user?.id && tokenRecord.userId !== user.id) throw new AppError(400, 'user_mismatch', 'warn');
  }

  if (isExpiredDate(tokenRecord.expiresAt)) {
    throw new AppError(401, `${tokenRecord.type}_expired`, 'warn');
  }

  // Invoked but not expired: only this token's own single-use cookie keeps it usable.
  if (tokenRecord.invokedAt && !(await holdsSingleUse(ctx, tokenType, tokenRecord.id))) {
    throw new AppError(401, `${tokenRecord.type}_expired`, 'warn');
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
        expiresAt: createDate(singleUseWindow(tokenRecord.type)),
      })
      .where(and(eq(tokensTable.id, tokenRecord.id), isNull(tokensTable.invokedAt)))
      .returning();

    // CAS won: hand the RAW single-use token back so the caller can set the cookie.
    if (invokedTokenRecord) return { ...invokedTokenRecord, singleUseToken: rawSingleUseToken };

    // CAS lost: tolerate only while the caller presents this token's own single-use cookie, otherwise it is spent.
    // Returning a null `singleUseToken` keeps the caller from re-setting the cookie.
    if (!(await holdsSingleUse(ctx, tokenType, tokenRecord.id))) {
      throw new AppError(401, `${tokenRecord.type}_expired`, 'warn');
    }
    return { ...tokenRecord, singleUseToken: null };
  }

  return tokenRecord;
};
