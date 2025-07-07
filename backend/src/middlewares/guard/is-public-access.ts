import type { MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { Env } from '#/lib/context';
import { registerMiddlewareDescription } from '#/lib/openapi-describer';

/**
 * Middleware for routes that are publicly accessible.
 * This is a required placeholder for routes that can be accessed by anyone.
 *
 * @param _ - Request context (unused here, but required by Hono middleware signature).
 * @param next - The next middleware or route handler.
 */
export const isPublicAccess: MiddlewareHandler<Env> = createMiddleware<Env>(async (_, next): Promise<void> => {
  await next();
});

/**
 * Registers the `isPublicAccess` middleware for OpenAPI documentation.
 * This allows the middleware to be recognized and described in the API documentation.
 */
registerMiddlewareDescription({
  name: 'isPublicAccess',
  middleware: isPublicAccess,
  category: 'auth',
  level: 'public',
  label: 'Public access',
});
