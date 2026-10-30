import type { z } from '@hono/zod-openapi';
import { appConfig } from 'shared';
import type { DbContext } from '#/core/context';
import { mailer } from '#/lib/mailer';
import { getRateLimiterInstance, reserveAttempt, subjectSegment } from '#/middlewares/rate-limiter/helpers';
import { sendMatrixMessage } from '#/modules/requests/helpers/send-matrix-message';
import { insertRequest } from '#/modules/requests/requests-queries';
import type { requestCreateBodySchema } from '#/modules/requests/requests-schema';
import { findUserByEmail } from '#/modules/user/user-queries';
import { log } from '#/utils/logger';
import { accountExistsEmail, requestInfoEmail, requestResponseEmail } from '../../../../emails';

const addressMailLimits = { points: 1, duration: 60 * 60 * 24 };
/** One mail per address a day from the form, whatever its type: anyone may type anyone's address into it. */
const addressMails = getRateLimiterInstance({ keyPrefix: 'requestFormMail', ...addressMailLimits, inMemoryBlock: false });
const mayMail = async (email: string) => (await reserveAttempt(addressMails, subjectSegment('email', email), addressMailLimits)).granted;

type CreateRequestInput = z.infer<typeof requestCreateBodySchema>;

/**
 * Stores a waitlist, newsletter or contact request and confirms it by mail. The caller answers every submission alike,
 * so the form tells nobody whether an address has an account or is listed already: a waitlist request from an address
 * with an account gets a mail pointing to sign-in and is not stored, and a repeat of a waitlist or newsletter request is
 * dropped. An address gets one mail from the form a day. Notifying the team runs in the background, so a stored
 * request is answered as fast as a dropped one.
 */
export async function createRequestOp(ctx: DbContext, input: CreateRequestInput) {
  // The body schema trims and lowercases the address.
  const { email: normalizedEmail, type, message } = input;
  const lng = appConfig.defaultLanguage;

  if (type === 'waitlist') {
    const existingUser = await findUserByEmail(ctx, { email: normalizedEmail });
    if (existingUser) {
      if (await mayMail(normalizedEmail)) {
        mailer
          .sendEmails(accountExistsEmail, { name: existingUser.name }, [{ email: normalizedEmail, lng: existingUser.language }])
          .catch((err) => log.error('Failed to send account-exists email', { err }));
      }
      return;
    }
  }

  // Taken before the insert, so a stored request and a dropped repeat cost the same statements.
  const confirms = await mayMail(normalizedEmail);
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
  }

  const staticProps = { type, message };

  sendMatrixMessage(textMessage)
    .then((sent) => {
      if (sent) return;
      // Replies go to the requester, who typed this address: answering means writing back.
      return mailer.sendEmails(
        requestInfoEmail,
        { ...staticProps, email: normalizedEmail, subject: title },
        [{ email: appConfig.company.email, lng }],
        normalizedEmail,
      );
    })
    .catch((err) => log.error('Failed to notify the team of a request', { err }));

  if (!confirms) return;
  mailer
    .sendEmails(requestResponseEmail, { type }, [{ email: normalizedEmail, lng }])
    .catch((err) => log.error('Failed to send request confirmation', { err }));
}
