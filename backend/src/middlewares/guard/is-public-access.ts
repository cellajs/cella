import type { MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { Env } from '#/lib/context';

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

// biome-ignore lint/suspicious/noExplicitAny: Metadata for OpenAPI documentation (more metadata can be added later)
(isPublicAccess as any).__openapi = { name: 'isPublicAccess' };
