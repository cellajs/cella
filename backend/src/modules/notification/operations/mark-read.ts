import type { z } from '@hono/zod-openapi';
import type { UserContext } from '#/core/context';
import { toUser } from '#/modules/entities/stream/audiences';
import { sendSignal } from '#/modules/entities/stream/send-signal';
import { markNotificationsRead } from '#/modules/notification/notification-queries';
import type { markReadBodySchema } from '#/modules/notification/notification-schema';

type MarkReadInput = z.infer<typeof markReadBodySchema>;

/** Mark notifications read. Scoped to the caller's own rows in the query, so an id of someone else's row updates nothing. */
export async function markReadOp(ctx: UserContext, input: MarkReadInput) {
  const userId = ctx.var.user.id;
  const updated = await markNotificationsRead(ctx, { userId, ...input });
  // The user's other tabs and devices drop the unread badge too.
  if (updated > 0) await sendSignal('notification.read', toUser(userId), {});
  return { updated };
}
