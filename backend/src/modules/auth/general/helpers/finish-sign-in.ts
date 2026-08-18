import type { Context } from 'hono';
import { appConfig } from 'shared';
import type { Env } from '#/core/context';
import { initiateMfa } from '#/modules/auth/general/helpers/mfa';
import { resolvePostAuthRedirectPath } from '#/modules/auth/general/helpers/redirect-path';
import { setUserSession } from '#/modules/auth/general/helpers/session';
import type { AuthStrategy } from '#/modules/auth/sessions-db';
import type { UserWithCounters } from '#/modules/user/helpers/select';

/**
 * Shared tail of every browser-navigated sign-in flow: start an MFA challenge when required, otherwise set the session,
 * then 302 to the resolved post-auth path. The redirect is carried into the MFA challenge so it survives it.
 */
export const finishSignIn = async (
  ctx: Context<Env>,
  user: UserWithCounters,
  strategy: AuthStrategy,
  redirectPath?: string | null,
) => {
  const mfaRedirectPath = await initiateMfa(ctx, user);

  const resolvedPath = resolvePostAuthRedirectPath(user, { redirectPath, mfaPath: mfaRedirectPath });
  const redirectUrl = new URL(resolvedPath, appConfig.frontendUrl);

  if (!mfaRedirectPath) await setUserSession(ctx, user, strategy);

  return ctx.redirect(redirectUrl, 302);
};
