import { baseDb } from '#/db/db';
import { unbindInactiveMemberships } from '#/modules/memberships/memberships-queries';
import { deleteUsersByIds } from '#/modules/system/system-queries';
import { findUnprovenUserIds } from '#/modules/user/user-queries';
import { log } from '#/utils/logger';
import { TimeSpan } from '#/utils/time-span';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How long an account may sit unproven. Sign-ups create their account only when the mailed link is clicked; an OAuth
 * sign-up through an invitation creates it first and waits on a verification mail that lives two hours, so a week is
 * generous.
 */
const UNPROVEN_ACCOUNT_TTL = new TimeSpan(7, 'd');
const BATCH_SIZE = 500;

/**
 * Removes accounts nobody ever proved or used (see {@link findUnprovenUserIds}) once they are older than the TTL. Such an
 * account holds its address hostage: the real owner cannot sign up or connect a provider with it until they take the
 * account over by magic link. Invitations bound to it are released first, so they outlive the cascade and are claimed
 * by whoever proves the address later.
 */
export async function reapUnprovenAccounts(now: Date = new Date()): Promise<number> {
  const createdBefore = new Date(now.getTime() - UNPROVEN_ACCOUNT_TTL.milliseconds()).toISOString();

  return baseDb.transaction(async (tx) => {
    const ctx = { var: { db: tx } };
    const userIds = await findUnprovenUserIds(ctx, { createdBefore, limit: BATCH_SIZE });
    if (!userIds.length) return 0;

    await unbindInactiveMemberships(ctx, { userIds });
    await deleteUsersByIds(ctx, { ids: userIds });

    log.info('Reaped unproven accounts', { count: userIds.length });
    return userIds.length;
  });
}

/** Daily in-process scheduler for {@link reapUnprovenAccounts}; failures are logged and absorbed. Returns a stop function. */
export function scheduleReapUnprovenAccounts(intervalMs: number = ONE_DAY_MS): () => void {
  const run = () => {
    reapUnprovenAccounts().catch((error) => log.error('Reaping unproven accounts failed', { err: error }));
  };

  // Defer the first run so it never competes with boot-time migrations.
  const startTimer = setTimeout(run, Math.min(intervalMs, 60 * 60 * 1000));
  const interval = setInterval(run, intervalMs);
  if (typeof interval.unref === 'function') interval.unref();
  if (typeof startTimer.unref === 'function') startTimer.unref();

  return () => {
    clearTimeout(startTimer);
    clearInterval(interval);
  };
}
