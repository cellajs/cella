import type { Context } from 'hono';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { type CookieName, deleteAuthCookie, getAuthCookie } from '#/modules/auth/core/general/helpers/cookie';
import { readBrowserSession, type SessionCookieName, sessionCookieOf } from '#/modules/auth/core/sessions/operations/resolve-session';
import { revokeSessions } from '#/modules/auth/core/sessions/operations/revoke-sessions';
import { dropHeldLink, spendCookieToken } from '#/modules/auth/core/tokens/token-lifecycle';
import { linkTokenKinds } from '#/modules/auth/core/tokens/token-policies';
import { deleteAccounts } from '#/modules/user/operations/delete-accounts';
import { log } from '#/utils/logger';

/**
 * What a sign-out clears from this browser besides its session cookie: its step-up, what it holds of a sign-in in
 * progress, and an opened or held invitation, which would show the next person here its address and organization.
 */
const signedOutCookies: CookieName[] = [
  'session-step-up',
  'magic',
  'confirm-mfa',
  'invitation',
  ...linkTokenKinds.map((kind) => `${kind}-pending` as const),
];

/** Deletes the session cookie, and beside the normal session what this browser holds of it. */
const deleteSignedOutCookies = (ctx: Context<Env>, cookie: SessionCookieName) => {
  deleteAuthCookie(ctx, cookie);
  if (cookie === 'session') for (const name of signedOutCookies) if (getAuthCookie(ctx, name)) deleteAuthCookie(ctx, name);
};

/**
 * Signs this browser out of the session the request asks for (`sessionCookieOf`): the embedded one leaves the normal
 * one as it is, and the other way round. Before the normal session it ends what this browser holds of a sign-in in
 * progress (a link held for confirmation, a second-factor challenge). An anonymous session is all its account has: the
 * account goes with it, and so does an organization it alone manages, as a demo's. Every write runs before any cookie
 * goes: a failure leaves this browser all its cookies, and a retry finishes the job. A spend added here defers its
 * cookie delete as well.
 * @throws AppError 401 when the browser holds no such session and no second-factor challenge.
 */
export const signOutOp = async (ctx: Context<Env>) => {
  const cookie = sessionCookieOf(ctx);
  if (cookie === 'session') {
    // A magic link held here for confirmation, never confirmed, goes. A provider connect started here dies with the
    // session below: its pin serves only the session that started it.
    await dropHeldLink(ctx, 'magic');

    // A second-factor challenge this browser holds ends too: its token row is spent.
    if (getAuthCookie(ctx, 'confirm-mfa')) {
      await spendCookieToken(ctx, 'confirm-mfa', { deleteCookie: 'after-commit' });
      log.info('User mfa canceled');

      // Canceling from the MFA page carries no session cookie: ending the challenge is then the whole sign-out.
      if (!getAuthCookie(ctx, 'session')) {
        deleteSignedOutCookies(ctx, cookie);
        return;
      }
    }
  }

  try {
    const { session } = await readBrowserSession(getAuthCookie(ctx, cookie));
    if (session.authStrategy === 'anonymous') await deleteAccounts(ctx, { userIds: [session.userId], by: session.userId });
    else await revokeSessions(ctx, { userId: session.userId, sessionIds: [session.id], reason: 'sign_out', by: session.userId });
    log.info('User signed out', { userId: session.userId, anonymous: session.authStrategy === 'anonymous' });
  } catch (err) {
    // A refusal means no live session is left to end, so the cookies go all the same; a failed read or write keeps them.
    if (err instanceof AppError && err.status === 401) deleteSignedOutCookies(ctx, cookie);
    throw err;
  }
  deleteSignedOutCookies(ctx, cookie);
};
