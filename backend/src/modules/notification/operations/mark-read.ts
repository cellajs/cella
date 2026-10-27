import type { z } from '@hono/zod-openapi';
import type { UserContext } from '#/core/context';
import { markNotificationsRead } from '#/modules/notification/notification-queries';
import type { markReadBodySchema } from '#/modules/notification/notification-schema';

type MarkReadInput = z.infer<typeof markReadBodySchema>;

/** Mark notifications read. Scoped to the caller's own rows in the query, so an id of someone else's row updates nothing. */
export async function markReadOp(ctx: UserContext, input: MarkReadInput) {
  return { updated: await markNotificationsRead(ctx, { userId: ctx.var.user.id, ...input }) };
}
