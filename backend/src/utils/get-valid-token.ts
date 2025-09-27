import { and, eq, gt, isNull } from 'drizzle-orm';
import { Context } from 'hono';
import { db } from '#/db/db';
import { type TokenModel, tokensTable } from '#/db/schema/tokens';
import { Env } from '#/lib/context';
import { AppError } from '#/lib/errors';
import { isExpiredDate } from '#/utils/is-expired-date';
import { getValidSingleUseToken } from './get-valid-single-use-token';
import { nanoid } from './nanoid';

type BaseProps = {
  ctx: Context<Env>;
  token: string;
  tokenType: TokenModel['type'];
  invokeToken?: boolean;
  isRedirect?: boolean;
};
/**
 * Validates a token by its value or ID, ensuring it matches the required type and is neither expired nor invoked.
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
// TODO redirect always true?
export const getValidToken = async ({ ctx, token, tokenType, invokeToken = true, isRedirect = true }: BaseProps): Promise<TokenModel> => {
  const condition = [
    isNull(tokensTable.invokedAt), // Token not yet invoked
    gt(tokensTable.expiresAt, new Date()), // Token not expired
    eq(tokensTable.token, token), // Match token value
  ];

  if (tokenType) condition.push(eq(tokensTable.type, tokenType));

  let [tokenRecord] = await db
    .select()
    .from(tokensTable)
    .where(and(...condition))
    .limit(1);

  // If token not found, perhaps user already has the single-use token
  if (!tokenRecord) tokenRecord = await getValidSingleUseToken({ ctx, tokenType, isRedirect });

  // Token expired
  if (isExpiredDate(tokenRecord.expiresAt)) {
    throw new AppError({ status: 401, type: `${tokenRecord.type}_expired`, severity: 'warn', isRedirect });
  }

  // Sanity check
  if (tokenType && tokenRecord.type !== tokenType) throw new AppError({ status: 401, type: 'invalid_token', severity: 'error', isRedirect });

  // Create single use session token and mark token as invoked
  if (invokeToken) {
    const [invokedTokenRecord] = await db
      .update(tokensTable)
      .set({ singleUseToken: nanoid(40), invokedAt: new Date() })
      .where(eq(tokensTable.id, tokenRecord.id))
      .returning();
    return invokedTokenRecord;
  }

  return tokenRecord;
};
