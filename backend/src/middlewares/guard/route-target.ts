import type { Context } from 'hono';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';

/** The 400 a guard answers for a route URL without the id it binds the request to. */
export const missingRouteParam = (name: 'tenantId' | 'organizationId') =>
  new AppError(400, 'invalid_request', 'error', { meta: { reason: `Missing ${name} parameter` } });

/**
 * The route's tenant and organization ids as the URL carries them, the tenant id lowercased. Every machine guard binds
 * the key or token to them, and `tenantGuard` resolves the same tenant id, so a key's tenant check and a token's
 * audience compare one spelling.
 * @throws AppError 400 `invalid_request` for a URL without a tenant id.
 */
export const routeTarget = (ctx: Context<Env>): { tenantId: string; organizationId?: string } => {
  const tenantId = ctx.req.param('tenantId')?.toLowerCase();
  if (!tenantId) throw missingRouteParam('tenantId');
  return { tenantId, organizationId: ctx.req.param('organizationId') };
};
