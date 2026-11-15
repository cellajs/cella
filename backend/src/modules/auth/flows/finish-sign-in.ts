import type { Context } from 'hono';
import { appConfig } from 'shared';
import type { Env } from '#/core/context';
import { navigationRedirect, resolvePostAuthRedirectPath } from '#/modules/auth/core/general/helpers/redirect-path';
import { type SessionExtras, setUserSession } from '#/modules/auth/core/sessions/operations/create-session';
import { type AuthStrategy, isSecondFactor } from '#/modules/auth/core/strategies';
import { initiateMfa } from '#/modules/auth/flows/mfa/operations/mfa-challenge';
import type { UserWithActivity } from '#/modules/user/helpers/select';

/**
 * Shared tail of every browser-navigated sign-in flow: start an MFA challenge when required, otherwise set the session,
 * then redirect to the resolved post-auth path. The redirect and the session extras (an SSO connection) are carried into
 * the MFA challenge so they survive it. A sign-in whose extras name a second factor already proven (an institution's
 * asserted MFA, or another authenticator's factor) is not challenged again: the session starts stepped up by it.
 */
export const finishSignIn = async (
  ctx: Context<Env>,
  user: UserWithActivity,
  strategy: AuthStrategy,
  redirectPath?: string | null,
  extras: SessionExtras = {},
) => {
  const mfaRedirectPath = isSecondFactor(extras.steppedUpVia) ? null : await initiateMfa(ctx, user, strategy, extras.connectionId);

  const resolvedPath = resolvePostAuthRedirectPath({ redirectPath, mfaPath: mfaRedirectPath });
  const redirectUrl = new URL(resolvedPath, appConfig.frontendUrl);

  if (!mfaRedirectPath) await setUserSession(ctx, user, strategy, 'regular', extras);

  return navigationRedirect(ctx, redirectUrl);
};
