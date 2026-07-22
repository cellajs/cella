import type { Context } from 'hono';

/**
 * Returns the client IP under Cella's single-trusted-proxy topology.
 * The load balancer appends the authoritative rightmost forwarding entry; socket address is the
 * direct-hit fallback. Forks with a different proxy count must select a different entry.
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
