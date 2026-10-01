import type { Context } from 'hono';
import { appConfig } from 'shared';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { stampStepUp } from '#/modules/auth/step-up/helpers/step-up';
import { findLinkToken, forgetLinkRequest, invokeToken, requestedHere } from '#/modules/auth/tokens/token-lifecycle';
import { isValidRedirectPath } from '#/utils/is-redirect-url';
import { log } from '#/utils/logger';

/**
 * Opens a step-up link. Only the browser that asked for it may open it: there the click stamps the session the link is
 * bound to, and nothing else, and signs nobody in. Opened anywhere else (another browser, a mail scanner) it is
 * refused before it is redeemed, so the browser that asked can still use it. Then back to the page that asked.
 * @throws AppError 401 `step-up_not_found`, 403 `step_up_other_browser`, 401 `step-up_expired` when the link or the
 *   session behind it ended.
 */
export const openStepUpLink = async (ctx: Context<Env>, rawToken: string) => {
  const token = await findLinkToken({ type: 'step-up', rawToken });
  if (!token) throw new AppError(401, 'step-up_not_found', 'warn');
  if (!(await requestedHere(ctx, 'step-up', token.id))) throw new AppError(403, 'step_up_other_browser', 'warn');

  const redeemed = await invokeToken(ctx, { type: 'step-up', rawToken });
  forgetLinkRequest(ctx, 'step-up');

  const stamped = !!redeemed.userId && !!redeemed.sessionId && (await stampStepUp(redeemed.sessionId, redeemed.userId, 'email'));
  if (!stamped) throw new AppError(401, 'step-up_expired', 'warn');

  log.info('Session stepped up', { via: 'email', sessionId: redeemed.sessionId });

  const path = isValidRedirectPath(redeemed.redirectPath) || appConfig.defaultRedirectPath;
  return ctx.redirect(new URL(path, appConfig.frontendUrl), 302);
};
