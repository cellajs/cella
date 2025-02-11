import type { Context, Next } from 'hono';

/**
 * Middleware for routes that are publicly accessible.
 * This is a required placeholder for routes that can be accessed by anyone.
 *
 * @param _ - Request context (unused here, but required by Hono middleware signature).
 * @param next - The next middleware or route handler.
 */
export async function isPublicAccess(_: Context, next: Next): Promise<void> {
  await next();
}
