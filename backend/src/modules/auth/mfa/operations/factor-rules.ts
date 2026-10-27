import { isStrategyEnabled } from 'shared';
import type { DbContext } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import { findHeldFactors } from '#/modules/auth/mfa/mfa-queries';
import { findUserForUpdate } from '#/modules/user/user-queries';

/**
 * MFA keeps both a passkey and an authenticator app, so a lost one can be replaced while the other still signs in.
 * Enabling needs both methods switched on and enrolled; while MFA is on, the last of either cannot be removed. The
 * interface enforces the same, this makes it hold for every caller.
 */
export const mfaFactorRules = {
  /**
   * Runs a change to the MFA switch or the factors in a transaction that first locks the user's row. Every such change
   * takes the lock, so they run one at a time and each check reads what the one before it committed; the checks below
   * run inside `change`, on the context it hands them.
   */
  locked<T>(userId: string, change: (txCtx: DbContext) => Promise<T>): Promise<T> {
    return baseDb.transaction(async (tx) => {
      const txCtx = { var: { db: tx } };
      await findUserForUpdate(txCtx, { id: userId });
      return change(txCtx);
    });
  },

  /** Refuses turning MFA on unless both methods are enabled for the app and enrolled by the user. */
  async assertCanEnable(ctx: DbContext, userId: string) {
    const missing = (['passkey', 'totp'] as const).find((method) => !isStrategyEnabled(method));
    if (missing) throw new AppError(400, 'forbidden_strategy', 'warn', { meta: { strategy: missing } });

    const { passkey, totp } = await findHeldFactors(ctx, { userId });
    if (!passkey || !totp) throw new AppError(400, 'mfa_factors_required', 'warn');
  },

  /**
   * Deletes a factor through `remove` in a `locked` transaction, then refuses when MFA is on and a method is now gone,
   * which rolls the delete back. It reads the MFA switch without locking again: `locked` holds the user row, so no
   * other transaction changes it.
   * @returns What `remove` returned.
   * @throws AppError 400 `mfa_factor_in_use`.
   */
  removeFactor<T>(userId: string, remove: (txCtx: DbContext) => Promise<T>): Promise<T> {
    return mfaFactorRules.locked(userId, async (txCtx) => {
      const removed = await remove(txCtx);
      const { mfaRequired, passkey, totp } = await findHeldFactors(txCtx, { userId });
      if (mfaRequired && (!passkey || !totp)) throw new AppError(400, 'mfa_factor_in_use', 'warn');
      return removed;
    });
  },
};
