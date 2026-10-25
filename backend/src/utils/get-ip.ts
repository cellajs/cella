import type { Context } from 'hono';

/**
 * Single-trusted-proxy topology: the load balancer appends the rightmost forwarding entry, which a client cannot forge,
 * with the socket address as the direct-hit fallback. A different proxy count needs a different entry.
 */
export const getIp = (ctx: Context): string | null => {
  const xff = ctx.req.header('x-forwarded-for');
  if (xff) {
    const client = xff
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .at(-1);
    if (client) return client;
  }
  return ctx.env.incoming.socket.remoteAddress ?? null;
};
