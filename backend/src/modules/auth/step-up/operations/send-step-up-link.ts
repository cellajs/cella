import type { Context } from 'hono';
import { appConfig } from 'shared';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import { mailer } from '#/lib/mailer';
import { refuseImpersonation } from '#/modules/auth/step-up/helpers/step-up';
import { readStepUp } from '#/modules/auth/step-up/operations/read-step-up';
import { issueToken, rememberLinkRequest } from '#/modules/auth/tokens/token-lifecycle';
import { tokenLinkUrl } from '#/modules/auth/tokens/token-policies';
import { isValidRedirectPath } from '#/utils/is-redirect-url';
import { log } from '#/utils/logger';
import { stepUpEmail } from '../../../../../emails';

interface SendStepUpLinkOpts {
  /** The page to return to once the link is opened. */
  redirect?: string;
}

/**
 * Mails the signed-in user a link that steps up this session when opened in this browser. Only for a user who holds no
 * second factor: the link stands in for one.
 * @throws AppError 403 `impersonation_forbidden`, 400 `invalid_request` when the user holds a second factor.
 */
export const sendStepUpLinkOp = async (ctx: Context<Env>, { redirect }: SendStepUpLinkOpts) => {
  const { user, session } = ctx.var;
  refuseImpersonation(session);

  const { methods } = await readStepUp(session);
  if (!methods.includes('email')) {
    throw new AppError(400, 'invalid_request', 'warn', { meta: { reason: 'second_factor_held' } });
  }

  const { token, rawToken } = await issueToken(
    { var: { db: baseDb } },
    {
      type: 'step-up',
      userId: user.id,
      email: user.email,
      createdBy: user.id,
      sessionId: session.id,
      redirectPath: isValidRedirectPath(redirect),
    },
  );
  // Opening the link stamps this session only in this browser.
  await rememberLinkRequest(ctx, 'step-up', token.id);

  const stepUpUrl = tokenLinkUrl('step-up', rawToken);
  mailer.prepareEmails(stepUpEmail, { stepUpUrl, name: user.name }, [{ email: user.email, lng: user.language ?? appConfig.defaultLanguage }]);

  if (appConfig.mode === 'development') console.info(`[step-up] ${user.email} ${stepUpUrl}`);
  log.info('Step-up link sent', { tokenId: token.id });
};
