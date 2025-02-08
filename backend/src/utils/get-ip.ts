import type { Context } from 'hono';

/**
 * Get IP address from Cloudflare proxy header or socket remote address.
 *  TODO: Insecure if not using cloudflare!?
 */
export const getIp = (ctx: Context) => ctx.req.header('x-forwarded-for')?.split(',')[0] || ctx.env.incoming.socket.remoteAddress || null;
