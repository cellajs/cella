import { TokenType } from 'config';
import { and, eq } from 'drizzle-orm';
import { Context } from 'hono';
import { db } from '#/db/db';
import { type TokenModel, tokensTable } from '#/db/schema/tokens';
import { AppError } from '#/lib/errors';
import { getAuthCookie } from '#/modules/auth/general/helpers/cookie';

type BaseProps = {
  ctx: Context;
  tokenType: TokenType;
};
/**
 * Validates a single use token by its value, ensuring it matches the required type.
 *
 * @param ctx - Hono context
 * @param tokenType (optional) The required type of the token (e.g., 'password-reset', 'email-verification').
 * @returns The valid single use token record from the database.
 * @throws AppError if the token is not found or of an invalid type.
 */
export const getValidSingleUseToken = async ({ ctx, tokenType }: BaseProps): Promise<TokenModel> => {
  // Find single use token in cookie
  const singleUseToken = await getAuthCookie(ctx, tokenType);
  if (!singleUseToken) throw new AppError({ status: 400, type: 'invalid_request', severity: 'error' });

  const condition = [
    eq(tokensTable.type, tokenType), // Match token type
    eq(tokensTable.singleUseToken, singleUseToken), // Match token value
  ];

  const [tokenRecord] = await db
    .select()
    .from(tokensTable)
    .where(and(...condition))
    .limit(1);

  if (!tokenRecord) throw new AppError({ status: 404, type: `${tokenType}_not_found`, severity: 'error' });

  // Sanity check
  if (tokenType && tokenRecord.type !== tokenType) throw new AppError({ status: 401, type: 'invalid_token', severity: 'error' });

  return tokenRecord;
};
