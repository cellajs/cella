import type { Context } from 'hono';

/**
 * Get IP address from socket remote address. You can change this
 * function to get the IP address from a request header
 */
export const getIp = (ctx: Context) => {
  console.log('getIp', ctx.env.incoming.socket.remoteAddress);
  return ctx.env.incoming.socket.remoteAddress || null;
};
