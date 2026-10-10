import type { Context } from 'hono';
import { appConfig } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import { mailer } from '#/lib/mailer';
import { maySignUp } from '#/modules/auth/invitations/operations/may-sign-up';
import { issueToken, rememberLinkRequest } from '#/modules/auth/tokens/token-lifecycle';
import { tokenLinkUrl } from '#/modules/auth/tokens/token-policies';
import { findAddressGovernance } from '#/modules/connections/connections-queries';
import { findUserByEmail } from '#/modules/user/user-queries';
import { isValidRedirectPath } from '#/utils/is-redirect-url';
import { log } from '#/utils/logger';
import { slugFromEmail } from '#/utils/slug';
import { magicLinkEmail } from '../../../../../emails';

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
 * Mails a magic link to the address: a sign-in link for its account, or a sign-up link when the address may sign up. Any
 * other address gets nothing, while this browser is marked as if a link went out, so the answer never tells whether the
 * address has an account.
 */
export const sendMagicLinkOp = async (ctx: Context<Env>, { email, redirect, assertedThrough }: SendMagicLinkOpts) => {
  // Validated here and re-validated at invoke; invalid input degrades to the default path.
  const redirectPath = isValidRedirectPath(redirect);

  const normalizedEmail = email.toLowerCase().trim();

  const existingUser = await findUserByEmail(ctx, { email: normalizedEmail });

  // An address an institution proved inherits its tenant's sign-in policy (D16): while that policy excludes magic
  // links, the address sends none and the answer points at the institution's entry. The user keeps every other
  // method and address; an unknown address still gets the silent answer below. The one exception is a link asked for
  // right after signing in at that same institution, which is how an account whose institution identifier changed gets
  // back in: the link then takes the institution account and the mailbox together, more than either alone.
  if (existingUser) {
    const governance = await findAddressGovernance(ctx, { email: normalizedEmail });
    const excludesMagic = governance?.status === 'active' && governance.authStrategies.length > 0 && !governance.authStrategies.includes('magic');
    if (excludesMagic && governance.connectionId !== assertedThrough) {
      throw new AppError(403, 'sso_required', 'warn', {
        meta: { connectionId: governance.connectionId, entryPath: `/auth/sso/${governance.connectionId}` },
      });
    }
  }

  if (!existingUser) {
    // Registration is closed to the public, but an invited address may still sign up. Anyone else gets the same 204
    // as a real request, to prevent email enumeration.
    if (!(await maySignUp(ctx, { email: normalizedEmail }))) {
      log.info('Magic link requested for unknown email', { email: normalizedEmail });
      await rememberLinkRequest(ctx, 'magic', generateId());
      return;
    }
  }

  // A sign-up link names no user: asking for it proves nothing about the address, so the account is created when the
  // link is clicked (claimMagicLinkOwner).
  const userId = existingUser?.id ?? null;
  const { token: tokenRecord, rawToken } = await issueToken(
    { var: { db: baseDb } },
    { type: 'magic', userId, email: normalizedEmail, createdBy: userId, redirectPath },
  );

  // Opening the link in this browser signs in directly; elsewhere it asks for a confirmation first.
  await rememberLinkRequest(ctx, 'magic', tokenRecord.id);

  const magicLinkUrl = tokenLinkUrl('magic', rawToken);

  const staticProps = { magicLinkUrl, name: existingUser?.name ?? slugFromEmail(normalizedEmail), isNewUser: !existingUser };
  const recipients = [{ email: normalizedEmail, lng: existingUser?.language ?? appConfig.defaultLanguage }];

  mailer.prepareEmails(magicLinkEmail, staticProps, recipients);

  if (appConfig.mode === 'development') {
    console.info(`[magic-link] ${normalizedEmail} ${magicLinkUrl}`);
  }

  log.info('Magic link email sent', { userId, signUp: !existingUser });
};
