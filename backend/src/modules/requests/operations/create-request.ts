import type { z } from '@hono/zod-openapi';
import { appConfig } from 'shared';
import type { DbContext } from '#/core/context';
import { mailer } from '#/lib/mailer';
import { getRateLimiterInstance, reserveAttempt, subjectSegment } from '#/middlewares/rate-limiter/helpers';
import { insertRequest } from '#/modules/requests/requests-queries';
import type { requestCreateBodySchema } from '#/modules/requests/requests-schema';
import { findUserByEmail } from '#/modules/user/user-queries';
import { log } from '#/utils/logger';
import { accountExistsEmail, requestReceivedEmail, requestResponseEmail } from '../../../../emails';

const addressMailLimits = { points: 1, duration: 60 * 60 * 24 };
/** One mail per address a day from the form, whatever its kind: anyone may type anyone's address into it. */
const addressMails = getRateLimiterInstance({ keyPrefix: 'requestFormMail', ...addressMailLimits });
const mayMail = async (email: string) => (await reserveAttempt(addressMails, subjectSegment('email', email), addressMailLimits)).granted;

type CreateRequestInput = z.infer<typeof requestCreateBodySchema>;

/**
 * Stores a waitlist, info or contact request and confirms it by mail. The caller answers every submission alike,
 * a waitlist or info one before this runs. The form tells nobody whether an address has an account or is
 * listed already: a waitlist request from an address with an account gets a mail pointing to sign-in and is not stored,
 * and a repeat of a waitlist or info request is dropped. An address gets one mail from the form a day. Notifying
 * the team runs in the background.
 */
export async function createRequestOp(ctx: DbContext, input: CreateRequestInput) {
  // The body schema trims and lowercases the address.
  const { email: normalizedEmail, kind, message } = input;
  const lng = appConfig.defaultLanguageCode;

  if (kind === 'waitlist') {
    const existingUser = await findUserByEmail(ctx, { email: normalizedEmail });
    if (existingUser) {
      if (await mayMail(normalizedEmail)) {
        mailer
          .sendEmails(accountExistsEmail, { name: existingUser.name }, [{ email: normalizedEmail, lng: existingUser.languageCode }])
          .catch((err) => log.error('Failed to send account-exists email', { err }));
      }
      return;
    }
  }

  // The unique index drops a repeat of a waitlist or info request, concurrent ones included.
  if (!(await insertRequest(ctx, { email: normalizedEmail, kind, message }))) return;

  let title: string;

  switch (kind) {
    case 'waitlist':
      title = 'Join waitlist request';
      break;
    case 'info':
      title = 'Info request';
      break;
    case 'contact':
      title = `Request for contact with message: "${message}"`;
      break;
  }

  // Replies go to the requester, who typed this address: answering means writing back.
  mailer
    .sendEmails(
      requestReceivedEmail,
      { kind, message, email: normalizedEmail, subject: title },
      [{ email: appConfig.company.email, lng }],
      normalizedEmail,
    )
    .catch((err) => log.error('Failed to notify the team of a request', { err }));

  // Reserved by the call that stored the row: a concurrent repeat that reserved first would leave it unconfirmed.
  if (!(await mayMail(normalizedEmail))) return;
  mailer
    .sendEmails(requestResponseEmail, { kind }, [{ email: normalizedEmail, lng }])
    .catch((err) => log.error('Failed to send request confirmation', { err }));
}
