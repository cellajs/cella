import { appConfig } from 'shared';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import { mailer } from '#/lib/mailer';
import { strategyLabels } from '#/modules/auth/general/helpers/strategy-labels';
import { findIdentityById } from '#/modules/auth/oauth/identities-queries';
import type { AuthStrategy } from '#/modules/auth/sessions/sessions-db';
import { issueToken, type NewToken } from '#/modules/auth/tokens/token-lifecycle';
import { tokenLinkUrl } from '#/modules/auth/tokens/token-policies';
import type { PendingSignUp } from '#/modules/auth/tokens/tokens-queries';
import { findEmail, findUserById } from '#/modules/user/user-queries';
import { log } from '#/utils/logger';
import { oauthVerificationEmail } from '../../../../../emails';

/** The mail goes out after the callback's transactions, on the base pool. */
const dbCtx = { var: { db: baseDb } };

type Props = { redirectPath?: string | null } & (
  | { userId: string; identityId: string }
  | {
      /** A sign-up without an account yet: the account is created once this mail's link is clicked. */
      signUp: PendingSignUp;
      /** The address the provider asserted, where the mail goes. */
      email: string;
    }
);

/** The provider's name as people read it: an identity stores the strategy slug as its issuer. */
const readableProviderName = (issuer: string) => strategyLabels[issuer as AuthStrategy] ?? issuer;

/** What the mail says and where it goes, with the token that stands for the verification. */
const verificationFor = async (props: Props) => {
  // Kept on the token row (not the emailed URL) so the deep link doesn't leak into email bodies
  const redirectPath = props.redirectPath || null;

  if ('signUp' in props) {
    const { signUp, email } = props;
    const token: NewToken = { type: 'oauth-verification', email, pendingSignUp: signUp, redirectPath };
    return { token, name: signUp.name, lng: appConfig.defaultLanguage, providerName: readableProviderName(signUp.issuer), isNewUser: true };
  }

  const user = await findUserById(dbCtx, { id: props.userId });
  if (!user) throw new AppError(404, 'not_found', 'warn', { entityType: 'user' });

  const identity = await findIdentityById(dbCtx, { id: props.identityId });
  if (!identity) throw new AppError(404, 'not_found', 'warn');

  // The address under verification is the provider's, which may differ from the account's own.
  const email = identity.email ?? user.email;

  const emailInUse = await findEmail(dbCtx, { email });

  if (emailInUse && identity.verified) {
    throw new AppError(409, 'email_exists', 'warn', { entityType: 'user' });
  }

  const token: NewToken = {
    type: 'oauth-verification',
    userId: user.id,
    email,
    createdBy: user.id,
    identityId: identity.id,
    redirectPath,
  };
  return { token, name: user.name, lng: user.language, providerName: readableProviderName(identity.issuer), isNewUser: false };
};

/**
 * Email verification for an OAuth account, proving the OAuth account holder also owns the email address: for an
 * identity on an account, or for a sign-up that creates its account only once the link is clicked. A fresh mail
 * replaces the earlier ones for the same identity or signing-up provider account.
 */
export const sendOAuthVerificationEmail = async (props: Props) => {
  const { token, name, lng, providerName, isNewUser } = await verificationFor(props);

  const { token: tokenRecord, rawToken } = await issueToken(dbCtx, token);

  const verificationLink = tokenLinkUrl('oauth-verification', rawToken);

  const staticProps = { verificationLink, name, providerEmail: tokenRecord.email, providerName, isNewUser };
  const recipients = [{ email: tokenRecord.email, lng }];

  mailer.prepareEmails(oauthVerificationEmail, staticProps, recipients).catch((err) => log.error('Failed to send OAuth verification email', { err }));

  if (appConfig.mode === 'development') {
    console.info(`[verification-link] ${tokenRecord.email} ${verificationLink}`);
  }

  log.info('Verification email sent', { userId: tokenRecord.userId, signUp: !!tokenRecord.pendingSignUp });
};
