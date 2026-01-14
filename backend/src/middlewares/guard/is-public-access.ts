import { xMiddleware } from '#/docs/x-middleware';

/**
 * Middleware for routes that are publicly accessible.
 * This is a required placeholder for routes that can be accessed by anyone.
 *
 * @param _ - Request context (unused here, but required by Hono middleware signature).
 * @param next - The next middleware or route handler.
 */
export const isPublicAccess = xMiddleware(
  'isPublicAccess',
  'x-guard',
  async (_, next) => {
    await next();
  },
  'No authentication required',
);
