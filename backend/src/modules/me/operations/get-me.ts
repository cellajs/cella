import type { AuthContext } from '#/core/context';
import { findUserById, upsertLastStarted } from '#/modules/me/me-queries';
import { getIsoDate } from '#/utils/iso-date';

const THROTTLE_MS = 60 * 1000; // 1 minute
const lastStartedMemory = new Map<string, number>();

export async function getMeOp(ctx: AuthContext) {
  const isSystemAdmin = ctx.var.isSystemAdmin;
  const userId = ctx.var.userId;

  // Throttle lastStartedAt upsert; fire-and-forget like lastSeenAt.
  const now = Date.now();
  const last = lastStartedMemory.get(userId) ?? 0;
  if (now - last >= THROTTLE_MS) {
    lastStartedMemory.set(userId, now);
    const lastStartedAt = getIsoDate();
    upsertLastStarted(ctx, { lastStartedAt }).catch(() => {
      lastStartedMemory.delete(userId);
    });
  }

  const user = await findUserById(ctx);

  return { user, isSystemAdmin };
}
