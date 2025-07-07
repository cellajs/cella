import type { MiddlewareHandler } from 'hono';
import { every } from 'hono/combine';
import { ipRestriction } from 'hono/ip-restriction';
import { errorResponse } from '#/lib/errors';
import { registerMiddlewareDescription } from '#/lib/openapi-describer';
import { getIp } from '#/utils/get-ip';
import { env } from '../../env';
import { isSystemAdmin } from './is-system-admin';

const allowList = env.REMOTE_SYSTEM_ACCESS_IP.split(',') || [];

/**
 * Middleware that combines system admin check with IP restriction.
 * Uses `every` function from Hono to ensure both system admin check and IP restriction are passed.
 *
 * @returns Error response or undefined if the user is allowed to proceed.
 */
export const hasSystemAccess: MiddlewareHandler = every(
  isSystemAdmin,
  ipRestriction(getIp, { allowList }, async (_, c) => {
    return errorResponse(c, 422, 'forbidden', 'warn', undefined);
  }),
);

/**
 * Registers the `hasSystemAccess` middleware for OpenAPI documentation.
 * This allows the middleware to be recognized and described in the API documentation.
 */
registerMiddlewareDescription({
  name: 'hasSystemAccess',
  middleware: hasSystemAccess,
  category: 'auth',
  scopes: ['system'],
});
