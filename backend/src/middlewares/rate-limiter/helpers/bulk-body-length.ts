import type { Context } from 'hono';
import type { Env } from '#/core/context';

/**
 * Read the length of the bulk body array from the request.
 * Supports `{ ids: [...] }` shape (bulk delete) and top-level arrays (bulk create).
 * Returns 1 as fallback so every request costs at least 1 point.
 */
export const bulkBodyLength = async (ctx: Context<Env>): Promise<number> => {
  try {
    const contentType = ctx.req.header('content-type');
    if (!contentType?.includes('application/json')) return 1;

    const body = await ctx.req.json();

    if (Array.isArray(body)) return Math.max(body.length, 1);
    if (body && Array.isArray(body.ids)) return Math.max(body.ids.length, 1);
  } catch {}

  return 1;
};
