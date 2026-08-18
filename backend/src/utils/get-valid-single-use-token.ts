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
/** @throws AppError when the cookie token is missing, expired, or of another type. */
export const getValidSingleUseToken = async ({ ctx, tokenType }: Props): Promise<TokenModel> => {
  const singleUseToken = await getAuthCookie(ctx, tokenType);
  if (!singleUseToken) throw new AppError(400, 'invalid_token', 'warn');

  // The DB stores only the hash, so hash before lookup and the (type, singleUseToken) index still serves
  // the query. Read-many: the row stays intact for later reads in the same invitation or oauth flow.
  const hashedSingleUseToken = hashToken(singleUseToken);
  const [tokenRecord] = await db
    .select()
    .from(tokensTable)
    .where(and(eq(tokensTable.type, tokenType), eq(tokensTable.singleUseToken, hashedSingleUseToken)))
    .limit(1);

  if (!tokenRecord) throw new AppError(404, `${tokenType}_not_found`, 'error');

  if (isExpiredDate(tokenRecord.expiresAt)) {
    throw new AppError(401, `${tokenRecord.type}_expired`, 'warn');
  }

  return tokenRecord;
};
