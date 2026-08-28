import type { AuthContext } from '#/core/context';
import { markContextNotificationsRead, markNotificationsRead } from '../notification-queries';

export interface MarkReadInput {
  ids?: string[];
  contextId?: string;
}

/**
 * Mark notifications read. Scoped to the caller's own rows in the query, so an id belonging to
 * someone else is a silent no-op.
 */
export async function markReadOp(ctx: AuthContext, input: MarkReadInput) {
  const userId = ctx.var.user.id;

  if (input.contextId) return { updated: await markContextNotificationsRead(ctx, userId, input.contextId) };

  return { updated: await markNotificationsRead(ctx, userId, input.ids) };
}
