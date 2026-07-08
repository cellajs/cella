import { appConfig } from 'shared';
import { mailer } from '#/lib/mailer';
import { log } from '#/utils/logger';
import { accountSecurityEmail } from '../../../../../emails';

type AccountSecurityType = Parameters<typeof accountSecurityEmail.translate>[1]['type'];

/**
 * Send an account security notification email.
 * Fire-and-forget: errors are logged but never thrown.
 */
export const sendAccountSecurityEmail = (
  recipient: { email: string; name?: string; language?: string },
  type: AccountSecurityType,
  details?: Record<string, string | number>,
) => {
  const lng = recipient.language ?? appConfig.defaultLanguage;

  log.warn(`Security email: ${type}`, { email: recipient.email, ...details });

  mailer
    .prepareEmails(accountSecurityEmail, { name: recipient.name ?? '', type, details }, [
      { email: recipient.email, lng },
    ])
    .catch((err) => log.error('Failed to send security email', { type, err }));
};
