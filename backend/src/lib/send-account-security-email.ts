import i18n from 'i18next';
import { appConfig } from 'shared';
import { mailer } from '#/lib/mailer';
import { logEvent } from '#/utils/logger';
import { AccountSecurity } from '../../emails';

type AccountSecurityType = Parameters<typeof AccountSecurity>[0]['type'];

/**
 * Send an account security notification email.
 * Fire-and-forget — errors are logged but never thrown.
 */
export const sendAccountSecurityEmail = (
  recipient: { email: string; name?: string; language?: string },
  type: AccountSecurityType,
  details?: Record<string, string | number>,
) => {
  const lng = recipient.language ?? appConfig.defaultLanguage;
  const subject = i18n.t(`backend:email.account_security.${type}.title`, { lng, appName: appConfig.name, ...details });

  logEvent('warn', `Security email: ${type}`, { email: recipient.email, ...details });

  mailer
    .prepareEmails(AccountSecurity, { subject, lng, name: recipient.name ?? '', type, details }, [
      { email: recipient.email },
    ])
    .catch((err) => logEvent('error', 'Failed to send security email', { type, error: String(err) }));
};
