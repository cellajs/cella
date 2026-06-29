import { appConfig } from 'shared';
import { mailer } from '#/lib/mailer';
import { type LogContext, logEvent } from '#/utils/logger';
import { accountSecurityEmail } from '../../../../../emails';

type AccountSecurityType = Parameters<typeof accountSecurityEmail.translate>[1]['type'];

/**
 * Send an account security notification email.
 * Fire-and-forget — errors are logged but never thrown.
 */
export const sendAccountSecurityEmail = (
  logCtx: LogContext,
  recipient: { email: string; name?: string; language?: string },
  type: AccountSecurityType,
  details?: Record<string, string | number>,
) => {
  const lng = recipient.language ?? appConfig.defaultLanguage;

  logEvent(logCtx, 'warn', `Security email: ${type}`, { email: recipient.email, ...details });

  mailer
    .prepareEmails(accountSecurityEmail, { name: recipient.name ?? '', type, details }, [
      { email: recipient.email, lng },
    ])
    .catch((err) => logEvent(logCtx, 'error', 'Failed to send security email', { type, error: String(err) }));
};
