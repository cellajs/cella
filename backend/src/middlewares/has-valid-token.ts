import { eq } from 'drizzle-orm';
import type { MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';
import { db } from '#/db/db';
import { type TokenModel, tokensTable } from '#/db/schema/tokens';
import type { Env } from '#/lib/context';
import { AppError } from '#/lib/errors';
import { isExpiredDate } from '#/utils/is-expired-date';

/**
 * Middleware to get and check the validity of a token, and set token data in context.
 * If all checks pass, the token data is added to the context for further processing in request lifecycle.
 *
 * @param requiredType - `"email_verification" | "password_reset" | "invitation"` Type of token that is required. This parameter ensures that only tokens of the specified type are accepted.
 * @returns Error response or undefined if the token is valid.
 *
 */
export const hasValidToken = (requiredType: TokenModel['type']): MiddlewareHandler<Env> =>
  createMiddleware<Env>(async (ctx, next) => {
    // Find token in request
    const token = ctx.req.param('token');
    if (!token) throw new AppError({ status: 400, type: 'invalid_request', severity: 'error' });

    // Check if token exists
    const [tokenRecord] = await db.select().from(tokensTable).where(eq(tokensTable.token, token));
    if (!tokenRecord) {
      throw new AppError({ status: 404, type: `${requiredType}_not_found`, severity: 'warn', meta: { requiredType } });
    }
    // If token is expired, return an error
    if (isExpiredDate(tokenRecord.expiresAt)) {
      throw new AppError({ status: 401, type: `${requiredType}_expired`, severity: 'warn', meta: { requiredType } });
    }
    // Check if token type matches the required type (if specified)
    if (tokenRecord.type !== requiredType) {
      throw new AppError({ status: 401, type: 'invalid_token', severity: 'warn', meta: { requiredType } });
    }
    // Set token in context
    ctx.set('token', tokenRecord);

    await next();
  });
