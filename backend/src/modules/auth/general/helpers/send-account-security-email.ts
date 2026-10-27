import { appConfig } from 'shared';
import { mailer } from '#/lib/mailer';
import { log } from '#/utils/logger';
import { accountSecurityEmail } from '../../../../../emails';

type AccountSecurityType = Parameters<typeof accountSecurityEmail.translate>[1]['type'];

/** Fire-and-forget: errors are logged, never thrown. */
export const sendAccountSecurityEmail = (
  recipient: { id?: string; email: string; name?: string; language?: string },
  type: AccountSecurityType,
  details?: Record<string, string | number>,
) => {
  const lng = recipient.language ?? appConfig.defaultLanguage;

  // A new sign-in notice is routine; every other type marks something an operator may want to look at. Addresses and
  // IPs stay in the mail: the type and the recipient's user id find it.
  log[type === 'new-sign-in' ? 'info' : 'warn'](`Security email: ${type}`, { userId: recipient.id });

  mailer
    .sendEmails(accountSecurityEmail, { name: recipient.name ?? '', type, details }, [{ email: recipient.email, lng }])
    .catch((err) => log.error('Failed to send security email', { type, err }));
};

/** {@link sendAccountSecurityEmail} to the app's security inbox. */
export const sendSecurityInboxEmail = (type: AccountSecurityType, details?: Record<string, string | number>) =>
  sendAccountSecurityEmail({ email: appConfig.securityEmail, name: 'Security' }, type, details);
