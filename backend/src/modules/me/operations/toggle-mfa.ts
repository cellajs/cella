import type { Context } from 'hono';
import type { Env } from '#/core/context';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { deleteAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { sendAccountSecurityEmail } from '#/modules/auth/general/helpers/send-account-security-email';
import { mfaFactorRules } from '#/modules/auth/mfa/operations/factor-rules';
import { setUserSession } from '#/modules/auth/sessions/operations/create-session';
import { revokeSessions } from '#/modules/auth/sessions/operations/revoke-sessions';
import { readStepUp } from '#/modules/auth/step-up/operations/read-step-up';
import { findCurrentUser, updateUserMfa } from '#/modules/me/me-queries';

/**
 * Turns MFA on or off for the signed-in user. Turning it on ends every other regular session and replaces this
 * browser's with an mfa session: same sign-in method, stepped up by the factor that proved this session.
 * @returns The user as `getMe` returns it, with the new MFA flag and the new session's sign-in time.
 */
export async function toggleMfaOp(ctx: Context<Env>, mfaRequired: boolean) {
  const { user, session } = ctx.var;

  // The guard refused a session that has not stepped up; the factor that proved this one is the step-up of the mfa
  // session minted below. Turning MFA on needs both factors enrolled, so a passing step-up always names one.
  const { factor } = await readStepUp(session);

  // The flag and the sessions it ends change together, after a factor delete that got the lock first.
  const updatedUser = await mfaFactorRules.locked(user.id, async (tx) => {
    if (mfaRequired) await mfaFactorRules.assertCanEnable(tx, user.id);
    const txCtx = { var: { ...ctx.var, db: tx } };
    const updated = await updateUserMfa(txCtx, { mfaRequired });
    if (updated.mfaRequired) {
      // This browser's session gives way to the mfa session minted below; every other regular session ends.
      await revokeSessions(txCtx, { userId: user.id, sessionIds: [ctx.var.sessionId], reason: 'replaced', by: user.id });
      await revokeSessions(txCtx, { userId: user.id, all: true, type: 'regular', reason: 'mfa_enabled', by: user.id });
    }
    return updated;
  });

  invalidateCache.user(user.id);

  if (updatedUser.mfaRequired && factor) {
    // Clear session cookie to enforce fresh login
    deleteAuthCookie(ctx, 'session');

    await setUserSession(ctx, user, session.authStrategy, 'mfa', { steppedUpVia: factor, connectionId: session.connectionId });
  }

  sendAccountSecurityEmail(user, mfaRequired ? 'mfa-enabled' : 'mfa-disabled');

  // Re-select to include the activity times of the user's actors row
  return findCurrentUser(ctx);
}
