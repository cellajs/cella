import type { Context } from 'hono';
import { appConfig } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { mailer } from '#/lib/mailer';
import { isRecognizedBrowser } from '#/modules/auth/devices/operations/recognized-browser';
import { maySignUp } from '#/modules/auth/invitations/operations/may-sign-up';
import { issueToken, rememberLinkRequest } from '#/modules/auth/tokens/token-lifecycle';
import { tokenLinkUrl } from '#/modules/auth/tokens/token-policies';
import { findAddressGovernance } from '#/modules/connections/connections-queries';
import { findUserByEmail } from '#/modules/user/user-queries';
import { frontendRedirectPath } from '#/utils/frontend-redirect-path';
import { log } from '#/utils/logger';
import { slugFromEmail } from '#/utils/slug';
import { magicLinkEmail, ssoRequiredEmail } from '../../../../../emails';

interface SendMagicLinkOpts {
  email: string;
  /** The page to return to after signing in. */
  redirect?: string;
  /**
   * The connection whose institution asserted the address in this browser moments ago (`sendSsoRecoveryLinkOp`). That
   * connection's own policy does not refuse the link: the holder proved the institution account and proves the mailbox.
   */
  assertedThrough?: string;
}

/**
 * Mails a magic link to the address: a sign-in link for its account, or a sign-up link when the address may sign up. An
 * account whose tenant excludes magic links gets a mail pointing to its institution's sign-in. Any other address gets
 * nothing. Either way this browser is marked as if a link went out, so the 204 does not tell whether the address has an
 * account.
 * @throws AppError 403 `sso_required` in place of that pointer mail, for a caller that knows the account: a browser that
 * signed in to it, or the recovery route right after an institution asserted the address.
 */
export const sendMagicLinkOp = async (ctx: Context<Env>, { email, redirect, assertedThrough }: SendMagicLinkOpts) => {
  // Validated here and re-validated at invoke; invalid input degrades to the default path.
  const redirectPath = frontendRedirectPath(redirect);

  const normalizedEmail = email.toLowerCase().trim();

  const existingUser = await findUserByEmail(ctx, { email: normalizedEmail });

  // An address an institution proved inherits its tenant's sign-in policy: while that policy excludes magic links,
  // the address sends none and is pointed at the institution's entry. The user keeps every other method and address.
  // The one exception is a link asked for right after signing in at that same institution, which is how an account
  // whose institution identifier changed gets back in: the link then takes the institution account and the mailbox
  // together, more than either alone.
  if (existingUser) {
    const governance = await findAddressGovernance(ctx, { email: normalizedEmail });
    const excludesMagic = governance?.status === 'active' && governance.authStrategies.length > 0 && !governance.authStrategies.includes('magic');
    if (excludesMagic && governance.connectionId !== assertedThrough) {
      const { connectionId, displayName } = governance;
      const entryPath = `/auth/sso/${connectionId}`;
      // The answer points there only for a caller that knows the account exists; a stranger gets the 204 every address
      // gets, and the pointer goes to the inbox.
      if (assertedThrough || (await isRecognizedBrowser(ctx, normalizedEmail))) {
        throw new AppError(403, 'sso_required', 'warn', { meta: { connectionId, entryPath } });
      }
      rememberLinkRequest(ctx, 'magic', generateId());
      const statics = { name: existingUser.name, institution: displayName, entryUrl: `${appConfig.frontendUrl}${entryPath}` };
      mailer
        .sendEmails(ssoRequiredEmail, statics, [{ email: normalizedEmail, lng: existingUser.language }])
        .catch((err) => log.error('Failed to send SSO-required email', { err }));
      log.info('Magic link refused by the sign-in policy, institution entry mailed', { userId: existingUser.id, connectionId });
      return;
    }
  } else if (!(await maySignUp(ctx, { email: normalizedEmail }))) {
    // Registration is closed to the public, but an invited address may still sign up. Anyone else gets the same 204
    // as a real request, to prevent email enumeration.
    log.info('Magic link requested for unknown email');
    rememberLinkRequest(ctx, 'magic', generateId());
    return;
  }

  // A sign-up link names no user: asking for it proves nothing about the address, so the account is created when the
  // link is clicked (claimMagicLinkHolder).
  const userId = existingUser?.id ?? null;
  const { token: tokenRecord, rawToken } = await issueToken(ctx, { type: 'magic', userId, email: normalizedEmail, createdBy: userId, redirectPath });

  // Opening the link in this browser signs in directly; elsewhere it asks for a confirmation first.
  rememberLinkRequest(ctx, 'magic', tokenRecord.id);

  const magicLinkUrl = tokenLinkUrl('magic', rawToken);

  const staticProps = { magicLinkUrl, name: existingUser?.name ?? slugFromEmail(normalizedEmail), isNewUser: !existingUser };
  const recipients = [{ email: normalizedEmail, lng: existingUser?.language ?? appConfig.defaultLanguage }];

  mailer.sendEmails(magicLinkEmail, staticProps, recipients).catch((err) => log.error('Failed to send magic link email', { err }));

  if (appConfig.mode === 'development') {
    console.info(`[magic-link] ${normalizedEmail} ${magicLinkUrl}`);
  }

  log.info('Magic link email sent', { userId, signUp: !existingUser });
};
