import type { Context } from 'hono';
import type { Env } from '#/core/context';
import type { Identifiers, RateLimitIdentifier } from '#/middlewares/rate-limiter/types';
import { getIp } from '#/utils/get-ip';
import { hashPii } from '#/utils/hash-pii';

/**
 * Extract identifiers from the request context for rate limiting.
 */
export const extractIdentifiers = async (
  ctx: Context<Env>,
  identifiersToExtract: RateLimitIdentifier[],
): Promise<Identifiers> => {
  const results: Identifiers = {
    email: null,
    ip: null,
    userId: null,
    tenantId: null,
  };

  // Use Hono's cached json() so the body stays available for downstream handlers.
  // Email is hashed before use as a rate-limit key, so PII is never stored or logged.
  if (identifiersToExtract.includes('email') && ctx.req.header('content-type')?.includes('application/json')) {
    try {
      const body = (await ctx.req.json()) as { email?: string };
      if (body.email) results.email = hashPii(body.email, 'rate-limit:email');
    } catch {}
  }

  if (identifiersToExtract.includes('ip')) results.ip = getIp(ctx);
  if (identifiersToExtract.includes('userId') && ctx.var.userId) results.userId = ctx.var.userId;
  if (identifiersToExtract.includes('tenantId') && ctx.var.tenantId) results.tenantId = ctx.var.tenantId;

  return results;
};
