import { appConfig } from 'shared';
import { AppError } from '#/core/error';
import { baseDb, type DbOrTx, type Tx } from '#/db/db';
import { getHeldFactors } from '#/modules/auth/mfa/mfa-queries';
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
   * run inside `change`.
   */
  async locked<T>(userId: string, change: (tx: Tx) => Promise<T>): Promise<T> {
    return baseDb.transaction(async (tx) => {
      await findUserForUpdate({ var: { db: tx } }, { id: userId });
      return change(tx);
    });
  },

  /** Refuses turning MFA on unless both methods are enabled for the app and enrolled by the user. */
  async assertCanEnable(tx: DbOrTx, userId: string) {
    const missing = (['passkey', 'totp'] as const).find((method) => !appConfig.enabledAuthStrategies.includes(method));
    if (missing) throw new AppError(400, 'forbidden_strategy', 'warn', { meta: { strategy: missing } });

    const { passkey, totp } = await getHeldFactors({ var: { db: tx } }, { userId });
    if (!passkey || !totp) throw new AppError(400, 'mfa_factors_required', 'warn');
  },

  /** Run after deleting a factor, in the same `locked` transaction: refuses when MFA is on and a method is now gone. */
  async assertKeepsFactors(tx: DbOrTx, userId: string) {
    const txCtx = { var: { db: tx } };
    const user = await findUserForUpdate(txCtx, { id: userId });
    if (!user?.mfaRequired) return;

    const { passkey, totp } = await getHeldFactors(txCtx, { userId });
    if (!passkey || !totp) throw new AppError(400, 'mfa_factor_in_use', 'warn');
  },
};
