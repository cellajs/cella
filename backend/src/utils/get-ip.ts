import type { Context } from 'hono';

/**
 * Get client IP address from proxy headers or socket.
 * Priority: X-Forwarded-For (first entry) → X-Real-IP → socket remote address.
 * Relies on Traefik being configured with trusted proxy IPs to prevent spoofing.
 */
export const getIp = (ctx: Context) => {
  return (
    ctx.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    ctx.req.header('x-real-ip') ||
    ctx.env.incoming.socket.remoteAddress ||
    null
  );
};
