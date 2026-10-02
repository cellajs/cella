import type { Context } from 'hono';
import { appConfig } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import type { Env } from '#/core/context';
import { baseDb } from '#/db/db';
import { mailer } from '#/lib/mailer';
import { maySignUp } from '#/modules/auth/auth-queries';
import { issueToken, rememberLinkRequest } from '#/modules/auth/tokens/token-lifecycle';
import { tokenLinkUrl } from '#/modules/auth/tokens/token-policies';
import { findUserByEmail } from '#/modules/user/user-queries';
import { isValidRedirectPath } from '#/utils/is-redirect-url';
import { log } from '#/utils/logger';
import { slugFromEmail } from '#/utils/slug-from-email';
import { magicLinkEmail } from '../../../../../emails';

interface SendMagicLinkOpts {
  email: string;
  /** The page to return to after signing in. */
  redirect?: string;
}

/**
 * Mails a magic link to the address: a sign-in link for its account, or a sign-up link when the address may sign up. Any
 * other address gets nothing, while this browser is marked as if a link went out, so the answer never tells whether the
 * address has an account.
 */
export const sendMagicLinkOp = async (ctx: Context<Env>, { email, redirect }: SendMagicLinkOpts) => {
  // Validated here and re-validated at invoke; invalid input degrades to the default path.
  const redirectPath = isValidRedirectPath(redirect);

  const normalizedEmail = email.toLowerCase().trim();

  const existingUser = await findUserByEmail(ctx, { email: normalizedEmail });

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
