import type { Context } from 'hono';

/**
 * Get IP address from socket remote address. You can change this
 * function to get the IP address from a request header
 */
export const getIp = (ctx: Context) => ctx.env.incoming.socket.remoteAddress || null;
