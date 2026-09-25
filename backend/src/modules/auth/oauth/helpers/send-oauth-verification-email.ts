import { and, eq } from 'drizzle-orm';
import { appConfig } from 'shared';
import { AppError } from '#/core/error';
import { baseDb as db } from '#/db/db';
import { mailer } from '#/lib/mailer';
import { identitiesTable } from '#/modules/auth/identities-db';
import { issueToken, type NewToken } from '#/modules/auth/tokens/token-lifecycle';
import type { PendingSignUp } from '#/modules/auth/tokens/tokens-queries';
import { type EmailModel, emailsTable } from '#/modules/user/emails-db';
import { userSelect } from '#/modules/user/helpers/select';
import { usersTable } from '#/modules/user/user-db';
import { log } from '#/utils/logger';
import { oauthVerificationEmail } from '../../../../../emails';

type Props = { redirectPath?: string | null } & (
  | { userId: string; identityId: string }
  | {
      /** A sign-up without an account yet: the account is created once this mail's link is clicked. */
      signUp: PendingSignUp;
      /** The address the provider asserted, where the mail goes. */
      email: string;
    }
);

/** What the mail says and where it goes, with the token that stands for the verification. */
const verificationFor = async (props: Props) => {
  // Kept on the token row (not the emailed URL) so the deep link doesn't leak into email bodies
  const redirectPath = props.redirectPath || null;

  if ('signUp' in props) {
    const { signUp, email } = props;
    const token: NewToken = { type: 'oauth-verification', email, pendingSignUp: signUp, redirectPath };
    return { token, name: signUp.name, lng: appConfig.defaultLanguage, providerName: signUp.issuer };
  }

  const [user] = await db.select(userSelect).from(usersTable).where(eq(usersTable.id, props.userId)).limit(1);
  if (!user) throw new AppError(404, 'not_found', 'warn', { entityType: 'user' });

  const [identity] = await db.select().from(identitiesTable).where(eq(identitiesTable.id, props.identityId));
  if (!identity) throw new AppError(404, 'not_found', 'warn');

  // The address under verification is the provider's, which may differ from the account's own.
  const email = identity.email ?? user.email;

  const [emailInUse]: (EmailModel | undefined)[] = await db
    .select()
    .from(emailsTable)
    .where(and(eq(emailsTable.email, email), eq(emailsTable.verified, true)));

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
  return { token, name: user.name, lng: user.language, providerName: identity.issuer };
};

/**
 * Email verification for an OAuth account, proving the OAuth account holder also owns the email address: for an
 * identity on an account, or for a sign-up that creates its account only once the link is clicked. A fresh mail
 * replaces the earlier ones for the same identity or signing-up provider account.
 */
export const sendOAuthVerificationEmail = async (props: Props) => {
  const { token, name, lng, providerName } = await verificationFor(props);

  const { token: tokenRecord, rawToken } = await issueToken({ var: { db } }, token);

  const verificationURL = new URL(`${appConfig.backendAuthUrl}/invoke-token/${tokenRecord.type}/${rawToken}`);

  const staticProps = {
    verificationLink: verificationURL.toString(),
    name,
    providerEmail: tokenRecord.email,
    providerName,
  };
  const recipients = [{ email: tokenRecord.email, lng }];

  mailer
    .prepareEmails(oauthVerificationEmail, staticProps, recipients)
    .catch((err) => log.error('Failed to send OAuth verification email', { err }));

  if (appConfig.mode === 'development') {
    console.info(`[verification-link] ${tokenRecord.email} ${verificationURL.toString()}`);
  }

  log.info('Verification email sent', { userId: tokenRecord.userId, signUp: !!tokenRecord.pendingSignUp });
};
