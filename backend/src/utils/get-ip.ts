import type { Context } from 'hono';

/**
 * Single-trusted-proxy topology: the last forwarding entry is the address exactly one proxy appended for its peer,
 * with the socket address as the fallback. Behind no proxy, or one that passes the client's header through, the client chooses it.
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
