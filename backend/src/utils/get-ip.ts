import type { Context } from 'hono';

/**
 * Client IP from the trusted single-hop proxy.
 *
 * Production topology: one Scaleway L7 load balancer → app (Docker bridge port). The LB appends the
 * observed client as the RIGHT-most X-Forwarded-For entry; every entry to its left is client-supplied
 * and must be ignored. `socket.remoteAddress` is always the LB (never the client), so it serves only
 * as a no-XFF fallback (dev/test/direct hits). `X-Real-IP` is intentionally not trusted — spoofable
 * and redundant once we read the right-most XFF entry.
 *
 * ⚠️ Fork note: this hardcodes cella's single-trusted-hop assumption. A fork behind a different proxy
 * chain (zero trusted hops, or 2+) must adjust which XFF entry is authoritative — the right-most entry
 * is only the real client when exactly one trusted proxy appends it.
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
