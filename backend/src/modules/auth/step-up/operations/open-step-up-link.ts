import type { Context } from 'hono';
import { appConfig } from 'shared';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import { updateSessionSteppedUp } from '#/modules/auth/sessions/sessions-queries';
import { forgetLinkRequest, invokeToken, requestedHere } from '#/modules/auth/tokens/token-lifecycle';
import { findLinkToken } from '#/modules/auth/tokens/tokens-queries';
import { isValidRedirectPath } from '#/utils/is-redirect-url';
import { log } from '#/utils/logger';

/** The link is read and the stamp written on the base pool, whatever the route's context holds. */
const dbCtx = { var: { db: baseDb } };

/**
 * Opens a step-up link. Only the browser that asked for it may open it: there the click stamps the session the link is
 * bound to, and nothing else, and signs nobody in. Opened anywhere else (another browser, a mail scanner) it is
 * refused before it is redeemed, so the browser that asked can still use it. Then back to the page that asked.
 * @throws AppError 401 `step-up_not_found`, 403 `step_up_other_browser`, 401 `step-up_expired` when the link or the
 *   session behind it ended.
 */
export const openStepUpLink = async (ctx: Context<Env>, rawToken: string) => {
  const token = await findLinkToken(dbCtx, { type: 'step-up', rawToken });
  if (!token) throw new AppError(401, 'step-up_not_found', 'warn');
  if (!(await requestedHere(ctx, 'step-up', token.id))) throw new AppError(403, 'step_up_other_browser', 'warn');

  const redeemed = await invokeToken(ctx, { type: 'step-up', rawToken });
  forgetLinkRequest(ctx, 'step-up');

  const { userId, sessionId } = redeemed;
  const stamped = !!userId && !!sessionId && !!(await updateSessionSteppedUp(dbCtx, { id: sessionId, userId, via: 'email' }));
  if (!stamped) throw new AppError(401, 'step-up_expired', 'warn');

  log.info('Session stepped up', { via: 'email', sessionId });

  const path = isValidRedirectPath(redeemed.redirectPath) || appConfig.defaultRedirectPath;
  return ctx.redirect(new URL(path, appConfig.frontendUrl), 302);
};
