/**
 * Middleware for public tenant-scoped routes.
 *
 * This middleware:
 * 1. Extracts tenantId from URL path
 * 2. Validates format (6-char lowercase alphanumeric)
 * 3. Wraps the request in a transaction with tenant context (no auth required)
 *
 * Used for /public/:tenantId routes where unauthenticated access is allowed.
 * RLS policies control which rows are visible (e.g., only is_public=true).
 *
 * @see info/RLS.md for architecture documentation
 */

import * as Sentry from '@sentry/node';
import { normalizeTenantId, setPublicRlsContext, validateTenantId } from '#/db/tenant-context';
import { xMiddleware } from '#/docs/x-middleware';
import { AppError } from '#/lib/error';

/**
 * Guard middleware for public tenant-scoped routes.
 * Validates tenant ID and wraps handler in public tenant context.
 *
 * @param ctx - Request/response context with tenantId URL parameter
 * @param next - The next middleware or route handler
 * @returns Error response or continues to next handler with public tenant context set
 */
export const hasPublicTenantAccess = xMiddleware(
  'hasPublicTenantAccess',
  'x-guard',
  async (ctx, next) => {
    const rawTenantId = ctx.req.param('tenantId');
    if (!rawTenantId) {
      throw new AppError(400, 'invalid_request', 'error', { meta: { reason: 'Missing tenantId parameter' } });
    }

    // Normalize to lowercase
    const tenantId = normalizeTenantId(rawTenantId);

    // Validate format (6-char lowercase alphanumeric)
    try {
      validateTenantId(tenantId);
    } catch {
      throw new AppError(400, 'invalid_request', 'error', { meta: { reason: 'Invalid tenant ID format' } });
    }

    // Set Sentry context
    Sentry.setTag('tenant_id', tenantId);

    // Wrap remaining middleware chain in public tenant context
    // RLS policies control visibility based on is_authenticated=false
    return setPublicRlsContext(tenantId, async (tx) => {
      // Store tenant-scoped transaction and tenantId in context
      ctx.set('db', tx);
      ctx.set('tenantId', tenantId);
      await next();
    });
  },
  'Validates tenant ID and wraps handler in public tenant context',
);
