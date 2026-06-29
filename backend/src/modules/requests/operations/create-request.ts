import { appConfig } from 'shared';
import type { AuthContext } from '#/core/context';
import { AppError } from '#/core/error';
import { mailer } from '#/lib/mailer';
import { sendMatrixMessage } from '#/lib/notifications/send-matrix-message';
import type { RequestModel } from '#/modules/requests/requests-db';
import { findExistingRequest, findUserByEmail, insertRequest } from '#/modules/requests/requests-queries';
import { requestInfoEmail, requestResponseEmail } from '../../../../emails';

// These requests are only allowed to be created if user has none yet
const uniqueRequests: RequestModel['type'][] = ['waitlist', 'newsletter'];

interface CreateRequestInput {
  email: string;
  type: string;
  message: string | null;
}

export async function createRequestOp(ctx: AuthContext, input: CreateRequestInput) {
  const { email, type: requestType, message } = input;
  // Cast type to proper literal union for Drizzle v1 strict types
  const type = requestType as RequestModel['type'];

  const normalizedEmail = email.toLowerCase().trim();

  if (type === 'waitlist') {
    const existingUser = await findUserByEmail(ctx, { email: normalizedEmail });
    if (existingUser) throw new AppError(400, 'request_email_is_user', 'info');
  }

  // Check if not duplicate for unique requests
  if (uniqueRequests.includes(type)) {
    const existingRequest = await findExistingRequest(ctx, { email: normalizedEmail, types: uniqueRequests });
    if (existingRequest?.type === type) throw new AppError(409, 'request_exists', 'info');
  }

  const createdRequest = await insertRequest(ctx, { email: normalizedEmail, type, message });

  // Determine message content based on notification type
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

  // Send message to Matrix
  const matrixResp = await sendMatrixMessage({ msgtype: 'm.notice', textMessage });

  // Send email
  const lng = appConfig.defaultLanguage;
  const staticProps = { type, message };
  const recipients = [{ email: normalizedEmail, lng }];

  if (!matrixResp?.ok) {
    mailer.prepareEmails(requestInfoEmail, { ...staticProps, email: normalizedEmail, subject: title }, [
      { email: appConfig.company.email, lng },
    ]);
  }

  mailer.prepareEmails(requestResponseEmail, staticProps, recipients);

  return {
    ...createdRequest,
    wasInvited: false,
  };
}
