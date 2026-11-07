import type { Context } from 'hono';
import { appConfig } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import { mailer } from '#/lib/mailer';
import { isRecognizedBrowser } from '#/modules/auth/devices/operations/recognized-browser';
import { findFollowedInvitation } from '#/modules/auth/invitations/operations/accept-followed-invitation';
import { hasPendingInvitation } from '#/modules/auth/invitations/operations/may-sign-up';
import { issueToken, rememberLinkRequest } from '#/modules/auth/tokens/token-lifecycle';
import { tokenLinkUrl } from '#/modules/auth/tokens/token-policies';
import { findAddressGovernance } from '#/modules/connections/connections-queries';
import { findUserByEmail } from '#/modules/user/user-queries';
import { frontendRedirectPath } from '#/utils/frontend-redirect-path';
import { log } from '#/utils/logger';
import { magicLinkEmail, ssoRequiredEmail } from '../../../../../emails';

/** The account's half of a request may run after the answer, so it reads and writes on the base pool. */
const dbCtx = { var: { db: baseDb } };

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

interface MagicLinkRequest extends Pick<SendMagicLinkOpts, 'assertedThrough'> {
  /** Normalized. */
  email: string;
  redirectPath: string | null;
  /** A browser that signed in to the account, or the recovery route: it may learn that the account exists. */
  knowsAccount: boolean;
  /** The link's token id, drawn before the token is stored: this browser's marker names it. */
  tokenId: string;
  /** The invitation to this address whose link this browser opened: the click accepts it on any device. */
  followedInvitationId: string | null;
}

/**
 * Mails a magic link to the address: a sign-in link for its account, or a sign-up link when the address may sign up. An
 * account whose tenant excludes magic links gets a mail pointing to its institution's sign-in. Any other address gets
 * nothing. Either way this browser is marked as if a link went out, and a caller that does not know the account is
 * answered before the address is looked up, so neither the 204 nor how soon it comes tells whether the address has an
 * account.
 * @throws AppError 403 `sso_required` in place of that pointer mail, for a caller that knows the account: a browser that
 * signed in to it, or the recovery route right after an institution asserted the address.
 */
export const sendMagicLinkOp = async (ctx: Context<Env>, { email, redirect, assertedThrough }: SendMagicLinkOpts) => {
  const normalizedEmail = email.toLowerCase().trim();
  const followed = await findFollowedInvitation(ctx);
  const request: MagicLinkRequest = {
    email: normalizedEmail,
    // Validated here and re-validated at invoke; invalid input degrades to the default path.
    redirectPath: frontendRedirectPath(redirect),
    assertedThrough,
    knowsAccount: !!assertedThrough || (await isRecognizedBrowser(ctx, normalizedEmail)),
    tokenId: generateId(),
    followedInvitationId: followed?.email.toLowerCase() === normalizedEmail ? followed.inactiveMembershipId : null,
  };

  // Only a caller that may hear `sso_required` waits for the account's half.
  if (request.knowsAccount) await mailMagicLink(request);
  else mailMagicLink(request).catch((err) => log.error('Failed to send magic link', { err }));

  // Opening the link in this browser signs in directly; elsewhere it asks for a confirmation first.
  rememberLinkRequest(ctx, 'magic', request.tokenId);
};

/**
 * The half of a request that depends on the address's account: the link, the institution's pointer or nothing.
 * @throws AppError 403 `sso_required` in place of the pointer mail, for a request that `knowsAccount`.
 */
const mailMagicLink = async ({ email, redirectPath, assertedThrough, knowsAccount, tokenId, followedInvitationId }: MagicLinkRequest) => {
  const existingUser = await findUserByEmail(dbCtx, { email });
  // Asked once: it decides whether the address may sign up and tells the sign-up mail it completes an invitation.
  const invited = !existingUser && (await hasPendingInvitation(dbCtx, { email }));

  // An address an institution proved inherits its tenant's sign-in policy: while that policy excludes magic links,
  // the address sends none and is pointed at the institution's entry. The user keeps every other method and address.
  // The one exception is a link asked for right after signing in at that same institution, which is how an account
  // whose institution identifier changed gets back in: the link then takes the institution account and the mailbox
  // together, more than either alone.
  if (existingUser) {
    const governance = await findAddressGovernance(dbCtx, { email });
    const excludesMagic = governance?.status === 'active' && governance.authStrategies.length > 0 && !governance.authStrategies.includes('magic');
    if (excludesMagic && governance.connectionId !== assertedThrough) {
      const { connectionId, displayName } = governance;
      const entryPath = `/auth/sso/${connectionId}`;
      // The answer points there only for a caller that knows the account exists; a stranger gets the 204 every address
      // gets, and the pointer goes to the inbox.
      if (knowsAccount) throw new AppError(403, 'sso_required', 'warn', { meta: { connectionId, entryPath } });
      const statics = { name: existingUser.name, institution: displayName, entryUrl: `${appConfig.frontendUrl}${entryPath}` };
      mailer
        .sendEmails(ssoRequiredEmail, statics, [{ email, lng: existingUser.languageCode }])
        .catch((err) => log.error('Failed to send SSO-required email', { err }));
      log.info('Magic link refused by the sign-in policy, institution entry mailed', { userId: existingUser.id, connectionId });
      return;
    }
  } else if (!appConfig.has.selfRegistration && !invited) {
    // Registration is closed to the public, but an invited address may still sign up (`maySignUp`). Anyone else gets the
    // same 204 as a real request, to prevent email enumeration.
    log.info('Magic link requested for unknown email');
    return;
  }

  // A sign-up link names no user: asking for it proves nothing about the address, so the account is created when the
  // link is clicked (claimMagicLinkHolder).
  const userId = existingUser?.id ?? null;
  const magicToken = { id: tokenId, type: 'magic' as const, userId, email, createdBy: userId, redirectPath, followedInvitationId };
  const { rawToken } = await issueToken(dbCtx, magicToken);

  const magicLinkUrl = tokenLinkUrl('magic', rawToken);

  // Only an account holder is greeted: an address alone names nobody.
  const staticProps = { magicLinkUrl, name: existingUser?.name ?? '', isNewUser: !existingUser, invited };
  const recipients = [{ email, lng: existingUser?.languageCode ?? appConfig.defaultLanguage }];

  mailer.sendEmails(magicLinkEmail, staticProps, recipients).catch((err) => log.error('Failed to send magic link email', { err }));

  if (appConfig.mode === 'development') {
    console.info(`[magic-link] ${email} ${magicLinkUrl}`);
  }

  log.info('Magic link created', { userId, signUp: !existingUser });
};
