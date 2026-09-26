import { appConfig } from 'shared';
import type { DbContext } from '#/core/context';
import { mailer } from '#/lib/mailer';
import { sendMatrixMessage } from '#/lib/notifications/send-matrix-message';
import { getRateLimiterInstance } from '#/middlewares/rate-limiter/helpers';
import type { RequestModel } from '#/modules/requests/requests-db';
import { insertRequest } from '#/modules/requests/requests-queries';
import { findUserByEmail } from '#/modules/user/user-queries';
import { log } from '#/utils/logger';
import { accountExistsEmail, requestInfoEmail, requestResponseEmail } from '../../../../emails';

/** One account-exists mail per address a day, however often the waitlist form names it. */
const accountExistsMails = getRateLimiterInstance({
  keyPrefix: 'accountExistsMail',
  points: 1,
  duration: 60 * 60 * 24,
});

interface CreateRequestInput {
  email: string;
  type: string;
  message: string | null;
}

/**
 * Stores a waitlist, newsletter or contact request and confirms it by mail. The caller answers every submission alike,
 * so the form tells nobody whether an address has an account or is listed already: an address with an account gets a
 * mail pointing to sign-in and no request, a repeat of a waitlist or newsletter request is dropped. Notifying the team
 * runs in the background, so a stored request takes no longer to answer than a dropped one.
 */
export async function createRequestOp(ctx: DbContext, input: CreateRequestInput) {
  const { email, type: requestType, message } = input;
  // Cast type to proper literal union for Drizzle v1 strict types
  const type = requestType as RequestModel['type'];

  const normalizedEmail = email.toLowerCase().trim();
  const lng = appConfig.defaultLanguage;

  if (type === 'waitlist') {
    const existingUser = await findUserByEmail(ctx, { email: normalizedEmail });
    if (existingUser) {
      const mailToday = await accountExistsMails.consume(`email:${normalizedEmail}`).then(
        () => true,
        () => false,
      );
      if (mailToday) {
        mailer
          .prepareEmails(accountExistsEmail, { name: existingUser.name }, [
            { email: normalizedEmail, lng: existingUser.language },
          ])
          .catch((err) => log.error('Failed to send account-exists email', { err }));
      }
      return;
    }
  }

  // The unique index drops a repeat of a waitlist or newsletter request, concurrent ones included.
  const createdRequest = await insertRequest(ctx, { email: normalizedEmail, type, message });
  if (!createdRequest) return;

  let textMessage: string;
  let title: string;

  switch (type) {
    case 'waitlist':
      textMessage = `New Waitlist Request\nEmail: ${normalizedEmail}`;
      title = 'Join waitlist request';
      break;
    case 'newsletter':
      textMessage = `Newsletter Signup Request\nEmail: ${normalizedEmail}`;
      title = 'Join newsletter request';
      break;
    case 'contact':
      textMessage = `Contact Request\nMessage: "${message}"\nEmail: ${normalizedEmail}`;
      title = `Request for contact with message: "${message}"`;
      break;
    default:
      textMessage = `Request\nEmail: ${normalizedEmail}`;
      title = 'Request received';
  }

  const staticProps = { type, message };

  sendMatrixMessage({ msgtype: 'm.notice', textMessage })
    .then((matrixResp) => {
      if (matrixResp?.ok) return;
      return mailer.prepareEmails(requestInfoEmail, { ...staticProps, email: normalizedEmail, subject: title }, [
        { email: appConfig.company.email, lng },
      ]);
    })
    .catch((err) => log.error('Failed to notify the team of a request', { err }));

  mailer
    .prepareEmails(requestResponseEmail, staticProps, [{ email: normalizedEmail, lng }])
    .catch((err) => log.error('Failed to send request confirmation', { err }));
}
