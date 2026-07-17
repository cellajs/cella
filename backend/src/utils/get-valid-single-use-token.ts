import { and, eq } from 'drizzle-orm';
import type { Context } from 'hono';
import type { TokenType } from 'shared';
import { AppError } from '#/core/error';
import { baseDb as db } from '#/db/db';
import { getAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { type TokenModel, tokensTable } from '#/modules/auth/tokens-db';
import { hashToken } from '#/utils/hash-token';
import { isExpiredDate } from '#/utils/is-expired-date';

type Props = {
  ctx: Context;
  tokenType: TokenType;
};
/**
 * Validates a single-use token from the auth cookie, ensuring it matches the required type.
 * @throws AppError if the token is not found or of an invalid type.
 */
export const getValidSingleUseToken = async ({ ctx, tokenType }: Props): Promise<TokenModel> => {
  // Find single use token in cookie
  const singleUseToken = await getAuthCookie(ctx, tokenType);
  if (!singleUseToken) throw new AppError(400, 'invalid_token', 'warn');

  // The cookie holds the raw token; the DB stores only its hash. Hash before lookup so the (type,
  // singleUseToken) index still serves the query. This flow is read-many (does not consume on read),
  // so the row is left intact for subsequent reads within the same invitation/oauth flow.
  const hashedSingleUseToken = hashToken(singleUseToken);
  const [tokenRecord] = await db
    .select()
    .from(tokensTable)
    .where(and(eq(tokensTable.type, tokenType), eq(tokensTable.singleUseToken, hashedSingleUseToken)))
    .limit(1);

  if (!tokenRecord) throw new AppError(404, `${tokenType}_not_found`, 'error');

  // Token expired
  if (isExpiredDate(tokenRecord.expiresAt)) {
    throw new AppError(401, `${tokenRecord.type}_expired`, 'warn');
  }

  return tokenRecord;
};
