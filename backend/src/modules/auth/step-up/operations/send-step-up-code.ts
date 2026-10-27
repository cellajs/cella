import type { Context } from 'hono';
import { appConfig } from 'shared';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { mailer } from '#/lib/mailer';
import { deviceInfo } from '#/modules/auth/sessions/helpers/device-info';
import { refuseImpersonation } from '#/modules/auth/step-up/helpers/step-up';
import { readStepUp } from '#/modules/auth/step-up/operations/read-step-up';
import { issueCodeToken } from '#/modules/auth/tokens/token-lifecycle';
import { log } from '#/utils/logger';
import { stepUpEmail } from '../../../../../emails';

/**
 * Mails the signed-in user a code that steps up this session, and only this one, when entered within ten minutes. For
 * a user without a second factor, or one who replaces a lost factor while MFA is off. The mail names the browser that
 * asked, so a user talked into reading the code out can see it is not theirs.
 * @throws AppError 403 `impersonation_forbidden`, 400 `invalid_request` when the user may not step up by mail.
 */
export const sendStepUpCodeOp = async (ctx: Context<Env>) => {
  const { user, session } = ctx.var;
  refuseImpersonation(session);

  const { methods } = await readStepUp(session, 'enroll');
  if (!methods.includes('email')) throw new AppError(400, 'invalid_request', 'warn', { meta: { reason: 'email_not_offered' } });

  const { token, code } = await issueCodeToken({ type: 'step-up', userId: user.id, email: user.email, sessionId: session.id });

  const { browser, os } = deviceInfo(ctx);
  const statics = { code, name: user.name, browser: browser ?? '', os: os ?? '' };
  mailer
    .sendEmails(stepUpEmail, statics, [{ email: user.email, lng: user.language ?? appConfig.defaultLanguage }])
    .catch((err) => log.error('Failed to send step-up email', { err }));

  if (appConfig.mode === 'development') console.info(`[step-up] ${user.email} ${code}`);
  log.info('Step-up code sent', { tokenId: token.id });
};
