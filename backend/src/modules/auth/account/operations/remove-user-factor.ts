import type { z } from '@hono/zod-openapi';
import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import type { recoverableFactorParamSchema } from '#/modules/auth/account/account-schema';
import { sendAccountSecurityEmail } from '#/modules/auth/core/general/helpers/send-account-security-email';
import { findHeldFactors } from '#/modules/auth/flows/mfa/mfa-queries';
import { mfaFactorRules } from '#/modules/auth/flows/mfa/operations/factor-rules';
import { deletePasskeysByUser } from '#/modules/auth/flows/passkeys/passkeys-queries';
import { deleteTotp } from '#/modules/auth/flows/totps/totps-queries';
import { findUserById, updateUserMfa } from '#/modules/user/user-queries';

type RecoverableFactor = z.infer<typeof recoverableFactorParamSchema>['factor'];

/**
 * Removes a lost factor from another user's account, for a system administrator helping someone locked out: every
 * passkey, or the authenticator app. The MFA rule that keeps the last factor gives way here, since recovery is what it
 * would otherwise block: when MFA is on and a required method is now gone, MFA turns off. The person is mailed about
 * the removal, and about MFA when it turned off.
 * @throws AppError 404 when no user has the id.
 */
export async function removeUserFactorOp(ctx: UserContext, userId: string, factor: RecoverableFactor) {
  const user = await findUserById(ctx, { id: userId });
  if (!user) throw new AppError(404, 'not_found', 'warn', { entityType: 'user' });

  const { removed, mfaDisabled } = await mfaFactorRules.locked(userId, async (txCtx) => {
    const removed = factor === 'passkey' ? await deletePasskeysByUser(txCtx, { userId }) : (await deleteTotp(txCtx, { userId })) ? 1 : 0;
    const held = await findHeldFactors(txCtx, { userId });
    const mfaDisabled = !!held.mfaRequired && (!held.passkey || !held.totp);
    if (mfaDisabled) await updateUserMfa(txCtx, { id: userId, mfaRequired: false });
    return { removed, mfaDisabled };
  });

  if (mfaDisabled) invalidateCache.user(userId);
  if (removed > 0) sendAccountSecurityEmail(user, factor === 'passkey' ? 'admin-passkeys-removed' : 'admin-totp-removed');
  if (mfaDisabled) sendAccountSecurityEmail(user, 'mfa-disabled');

  return { removed, mfaDisabled };
}
