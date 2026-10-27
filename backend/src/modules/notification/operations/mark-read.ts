import type { z } from '@hono/zod-openapi';
import type { UserContext } from '#/core/context';
import { markNotificationsRead } from '../notification-queries';
import type { markReadBodySchema } from '../notification-schema';

export type MarkReadInput = z.infer<typeof markReadBodySchema>;

/**
 * Mark notifications read. Scoped to the caller's own rows in the query, so an id belonging to
 * someone else is a silent no-op.
 */
export async function markReadOp(ctx: UserContext, input: MarkReadInput) {
  return { updated: await markNotificationsRead(ctx, { userId: ctx.var.user.id, ...input }) };
}
