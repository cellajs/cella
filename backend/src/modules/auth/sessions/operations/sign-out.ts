import type { Context } from 'hono';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { type CookieName, deleteAuthCookie, getAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { dropHeldMagicLink } from '#/modules/auth/magic/operations/magic-link-browser';
import { readBrowserSession } from '#/modules/auth/sessions/operations/resolve-session';
import { revokeSessions } from '#/modules/auth/sessions/operations/revoke-sessions';
import { spendCookieToken } from '#/modules/auth/tokens/token-lifecycle';
import { log } from '#/utils/logger';

/**
 * What a sign-out clears from this browser besides its session cookie: what it holds of a sign-in in progress, an
 * impersonation layered on the session, and an opened invitation, which would show the next person here its address
 * and organization.
 */
const signedOutCookies = ['magic', 'magic-pending', 'confirm-mfa', 'impersonation', 'invitation'] as const satisfies CookieName[];

const deleteSignedOutCookies = (ctx: Context<Env>) => {
  deleteAuthCookie(ctx, 'session');
  for (const name of signedOutCookies) if (getAuthCookie(ctx, name)) deleteAuthCookie(ctx, name);
};

/**
 * Signs this browser out: ends what it holds of a sign-in in progress (an opened magic link, a link held for
 * confirmation, a second-factor challenge), then its session and an impersonation layered on it. Every write runs
 * before any cookie goes, so a failure leaves this browser all its cookies and a retry finishes the job: a spend added
 * here defers its cookie delete as well.
 * @throws AppError 401 when the browser holds no session and no second-factor challenge.
 */
export const signOutOp = async (ctx: Context<Env>) => {
  // A magic link this browser opened lets it back in, with no other proof, until its single-use window closes: spent
  // whatever becomes of the session below, so the next person at a shared computer cannot reopen it.
  await spendCookieToken(ctx, 'magic', { deleteCookie: 'after-commit' });
  // A link held here for confirmation, never confirmed, goes as well. A provider connect started here dies with the
  // session below: its pin serves only the session that started it.
  await dropHeldMagicLink(ctx);

  // A second-factor challenge this browser holds ends too: its token row is spent.
  if (getAuthCookie(ctx, 'confirm-mfa')) {
    await spendCookieToken(ctx, 'confirm-mfa', { deleteCookie: 'after-commit' });
    log.info('User mfa canceled');

    // Canceling from the MFA page carries no session cookie: ending the challenge is then the whole sign-out.
    if (!getAuthCookie(ctx, 'session')) {
      deleteSignedOutCookies(ctx);
      return;
    }
  }

  try {
    const { session } = await readBrowserSession(getAuthCookie(ctx, 'session'));
    await revokeSessions(ctx, { userId: session.userId, sessionIds: [session.id], reason: 'sign_out', by: session.userId });
    log.info('User signed out', { userId: session.userId });
  } catch (err) {
    // A refusal means no live session is left to end, so the cookies go all the same; a failed read or write keeps them.
    if (err instanceof AppError && err.status === 401) deleteSignedOutCookies(ctx);
    throw err;
  }
  deleteSignedOutCookies(ctx);
};
