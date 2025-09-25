import { and, eq, gt, isNull } from 'drizzle-orm';
import { db } from '#/db/db';
import { type TokenModel, tokensTable } from '#/db/schema/tokens';
import { AppError } from '#/lib/errors';
import { isExpiredDate } from '#/utils/is-expired-date';

type BaseProps = {
  requiredType: TokenModel['type'];
  consumeToken?: boolean;
  isRedirect?: boolean;
};
type TokenIdentifierProps = { token: string; tokenId?: never; consumeToken?: true } | { tokenId: string; token?: never; consumeToken?: boolean };

/**
 * Validates a token by its value or ID, ensuring it matches the required type and is neither expired nor consumed.
 * By default, it consumes the token upon successful validation.
 *
 * @param token The token string to validate.
 * @param tokenId The token ID to validate.
 * @param requiredType The required type of the token (e.g., 'password_reset', 'email_verification').
 * @param consumeToken (Default: true) Whether to mark the token as consumed after validation.
 * @param isRedirect - Whether error requests should be redirects.
 * @returns The valid token record from the database.
 * @throws AppError if the token is not found, expired, or of an invalid type.
 */
export const getValidToken = async ({
  token,
  tokenId,
  requiredType,
  consumeToken = true,
  isRedirect = false,
}: BaseProps & TokenIdentifierProps): Promise<TokenModel> => {
  const condition = [
    isNull(tokensTable.consumedAt), // Token not yet consumed
    gt(tokensTable.expiresAt, new Date()), // Token not expired
    eq(tokensTable.type, requiredType), // Correct token type
    ...(token ? [eq(tokensTable.token, token)] : []),
    ...(tokenId ? [eq(tokensTable.id, tokenId)] : []),
  ];

  const [tokenRecord] = await db
    .select()
    .from(tokensTable)
    .where(and(...condition))
    .limit(1);

  const meta = { requiredType };

  if (!tokenRecord) throw new AppError({ status: 404, type: `${requiredType}_not_found`, severity: 'warn', meta, isRedirect });

  // Token expired
  if (isExpiredDate(tokenRecord.expiresAt)) throw new AppError({ status: 401, type: `${requiredType}_expired`, severity: 'warn', meta, isRedirect });

  // Sanity check
  if (tokenRecord.type !== requiredType) throw new AppError({ status: 401, type: 'invalid_token', severity: 'error', meta, isRedirect });

  // Consume token after validation
  if (consumeToken) await db.update(tokensTable).set({ consumedAt: new Date() }).where(eq(tokensTable.id, tokenRecord.id));
  return tokenRecord;
};
