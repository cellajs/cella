import { and, eq, gt, isNull } from 'drizzle-orm';
import { db } from '#/db/db';
import { type TokenModel, tokensTable } from '#/db/schema/tokens';
import { AppError } from '#/lib/errors';
import { isExpiredDate } from '#/utils/is-expired-date';
import { nanoid } from './nanoid';

type BaseProps = {
  token: string;
  consumeToken?: boolean;
  tokenType?: TokenModel['type'];
  isRedirect?: boolean;
};
/**
 * Validates a token by its value or ID, ensuring it matches the required type and is neither expired nor consumed.
 * By default, it consumes the token upon successful validation.
 *
 * @param token The token string to validate.
 * @param consumeToken (optional) Whether to create a new refresh token after validation.
 * @param tokenType (optional) The required type of the token (e.g., 'password_reset', 'email_verification').
 * @param isRedirect - Whether error requests should be redirects.
 * @returns The valid token record from the database.
 * @throws AppError if the token is not found, expired, or of an invalid type.
 */
// TODO redirect always true?
export const getValidToken = async ({ token, tokenType, consumeToken = true, isRedirect = false }: BaseProps): Promise<TokenModel> => {
  const condition = [
    isNull(tokensTable.consumedAt), // Token not yet consumed
    gt(tokensTable.expiresAt, new Date()), // Token not expired
    eq(tokensTable.token, token), // Match token value
  ];

  if (tokenType) condition.push(eq(tokensTable.type, tokenType));

  const [tokenRecord] = await db
    .select()
    .from(tokensTable)
    .where(and(...condition))
    .limit(1);

  if (!tokenRecord) throw new AppError({ status: 404, type: 'token_not_found', severity: 'error', isRedirect });

  // Token expired
  if (isExpiredDate(tokenRecord.expiresAt)) throw new AppError({ status: 401, type: `${tokenRecord.type}_expired`, severity: 'warn', isRedirect });

  // Sanity check
  if (tokenType && tokenRecord.type !== tokenType) throw new AppError({ status: 401, type: 'invalid_token', severity: 'error', isRedirect });

  // Create single use session token and mark token as consumed
  if (consumeToken) {
    const [consumedTokenRecord] = await db
      .update(tokensTable)
      .set({ singleUseToken: nanoid(40), consumedAt: new Date() })
      .where(eq(tokensTable.id, tokenRecord.id))
      .returning();
    return consumedTokenRecord;
  }

  return tokenRecord;
};
