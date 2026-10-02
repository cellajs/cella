import type { Context } from 'hono';
import type { Env } from '#/core/context';
import { deleteAuthCookie, getAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { dropHeldMagicLink } from '#/modules/auth/magic/helpers/magic-link-browser';
import { readOwnSession } from '#/modules/auth/sessions/operations/resolve-session';
import { revokeSessions } from '#/modules/auth/sessions/operations/revoke-sessions';
import { spendCookieToken } from '#/modules/auth/tokens/token-lifecycle';
import { log } from '#/utils/logger';

/**
 * Signs this browser out: ends what it holds of a sign-in in progress (an opened magic link, a link held for
 * confirmation, a second-factor challenge), then its session and an impersonation layered on it.
 * @throws AppError 401 when the browser holds no session and no second-factor challenge.
 */
export const signOutOp = async (ctx: Context<Env>) => {
  // A magic link this browser opened lets it back in, with no other proof, until its single-use window closes: spent
  // first, so it goes whatever becomes of the session below and the next person at a shared computer cannot reopen it.
  if (await getAuthCookie(ctx, 'magic')) await spendCookieToken(ctx, 'magic');
  // A link held here for confirmation, never confirmed, goes as well. A provider connect started here dies with the
  // session below: its pin serves only the session that started it.
  await dropHeldMagicLink(ctx);

  // A second-factor challenge this browser holds ends too: its cookie goes and its token row is spent.
  if (await getAuthCookie(ctx, 'confirm-mfa')) {
    await spendCookieToken(ctx, 'confirm-mfa');
    log.info('User mfa canceled');

    // Canceling from the MFA page carries no session cookie: ending the challenge is then the whole sign-out.
    if (!(await getAuthCookie(ctx, 'session'))) return;
  }

  // The browser's session cookie goes, and an impersonation layered on it, which `revokeSessions` revokes with it.
  const sessionToken = await getAuthCookie(ctx, 'session');
  deleteAuthCookie(ctx, 'session');
  if (await getAuthCookie(ctx, 'impersonation')) deleteAuthCookie(ctx, 'impersonation');

  const { session: currentSession } = await readOwnSession(sessionToken);

  await revokeSessions(ctx, {
    userId: currentSession.userId,
    sessionIds: [currentSession.id],
    reason: 'sign_out',
    by: currentSession.userId,
  });
  log.info('User signed out', { userId: currentSession.userId });
};
