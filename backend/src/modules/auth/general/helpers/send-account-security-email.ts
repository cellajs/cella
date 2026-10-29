import { appConfig } from 'shared';
import { mailer } from '#/lib/mailer';
import { getRateLimiterInstance, reserveAttempt, subjectSegment } from '#/middlewares/rate-limiter/helpers';
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
  // IPs stay in the mail: the type and the recipient's user id find it, and a mail without one keeps the request's ids.
  log[type === 'new-sign-in' ? 'info' : 'warn'](`Security email: ${type}`, recipient.id ? { userId: recipient.id } : undefined);

  mailer
    .sendEmails(accountSecurityEmail, { name: recipient.name ?? '', type, details }, [{ email: recipient.email, lng }])
    .catch((err) => log.error('Failed to send security email', { type, err }));
};

const perUserLimits = { points: 1, duration: 60 * 60 };
const perTypeLimits = { points: 20, duration: 60 * 60 };
const inboxMailsPerUser = getRateLimiterInstance({ keyPrefix: 'securityInboxMailUser', ...perUserLimits, inMemoryBlock: false });
const inboxMailsPerType = getRateLimiterInstance({ keyPrefix: 'securityInboxMailType', ...perTypeLimits, inMemoryBlock: false });

/** Whether a mail `raisedBy` raised may go: the user's own budget first, so one user cannot spend the ceiling. */
const inboxHasRoom = async (type: AccountSecurityType, raisedBy: string) => {
  try {
    const perUser = await reserveAttempt(inboxMailsPerUser, `${type}:${subjectSegment('userId', raisedBy)}`, perUserLimits);
    return perUser.granted && (await reserveAttempt(inboxMailsPerType, type, perTypeLimits)).granted;
  } catch (err) {
    log.error('Security inbox throttle failed', { type, err });
    return true;
  }
};

/**
 * {@link sendAccountSecurityEmail} to the app's security inbox. Never rejects.
 * @param raisedBy - The user whose request raised a type any user can raise (`sysadmin-fail`, `tenant-created`): one
 *   mail per type and user an hour, and at most 20 per type an hour, since accounts multiply. A type only an admin
 *   raises passes none and always mails.
 */
export const sendSecurityInboxEmail = async (type: AccountSecurityType, details?: Record<string, string | number>, raisedBy?: string) => {
  if (raisedBy && !(await inboxHasRoom(type, raisedBy))) return;
  sendAccountSecurityEmail({ email: appConfig.securityEmail, name: 'Security' }, type, details);
};
