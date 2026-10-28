import type { Context } from 'hono';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { deleteAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { sendAccountSecurityEmail } from '#/modules/auth/general/helpers/send-account-security-email';
import { mfaFactorRules } from '#/modules/auth/mfa/operations/factor-rules';
import { setUserSession } from '#/modules/auth/sessions/operations/create-session';
import { revokeSessions } from '#/modules/auth/sessions/operations/revoke-sessions';
import { readStepUp } from '#/modules/auth/step-up/operations/read-step-up';
import { findMfaRequired, findUserById, updateUserMfa } from '#/modules/user/user-queries';

/**
 * Turns MFA on or off for the signed-in user. Turning it on ends every other regular session and replaces this
 * browser's with an mfa session: same sign-in method, stepped up by the factor that proved this session.
 * @returns The user as `getMe` returns it, with the new MFA flag and the new session's sign-in time.
 */
export async function toggleMfaOp(ctx: Context<Env>, mfaRequired: boolean) {
  const { user, session } = ctx.var;

  const { factor, methods } = await readStepUp(session, 'account');

  // The flag and the sessions it ends change together, after a factor delete that got the lock first.
  const { updatedUser, changed } = await mfaFactorRules.locked(user.id, async (txCtx) => {
    if (mfaRequired) {
      await mfaFactorRules.assertCanEnable(txCtx, user.id);
      // The factor that proved this session is the step-up of the mfa session minted below. A session proven by an SSO
      // sign-in names none, so turning MFA on asks for one of the two factors it needs enrolled.
      if (!factor) throw new AppError(403, 'step_up_required', 'info', { meta: { methods } });
    }
    // Read under the lock, so the owner is mailed only for a switch this request flipped.
    const changed = (await findMfaRequired(txCtx, { userId: user.id })) !== mfaRequired;
    const updated = await updateUserMfa(txCtx, { id: user.id, mfaRequired });
    if (updated.mfaRequired) {
      // This browser's session gives way to the mfa session minted below; every other regular session ends.
      await revokeSessions(txCtx, { userId: user.id, sessionIds: [ctx.var.sessionId], reason: 'replaced', by: user.id });
      await revokeSessions(txCtx, { userId: user.id, all: true, type: 'regular', reason: 'mfa_enabled', by: user.id });
    }
    return { updatedUser: updated, changed };
  });

  invalidateCache.user(user.id);

  if (updatedUser.mfaRequired && factor) {
    // The mfa session set next takes this cookie's place.
    deleteAuthCookie(ctx, 'session');

    await setUserSession(ctx, user, session.authStrategy, 'mfa', { steppedUpVia: factor, connectionId: session.connectionId });
  }

  if (changed) sendAccountSecurityEmail(user, mfaRequired ? 'mfa-enabled' : 'mfa-disabled');

  return findUserById(ctx, { id: user.id });
}
