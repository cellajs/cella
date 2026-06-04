import { appConfig } from 'shared';
import { EmailBody, EmailContainer, EmailFooter, EmailHeader, EmailLogo, EmailText, SafeHtml } from '../components';
import i18n from '../i18n';
import { defineEmailTemplate } from '../types';
import type { RequestType } from './request-was-sent';

interface RequestInfoStatic {
  type: RequestType;
  email: string;
  message: string | null;
  subject: string;
}

/**
 * Email template for responses to sysadmin after users requests such as waitlist signups, newsletter subscriptions, or
 * contact form submissions.
 */
export const requestInfoEmail = defineEmailTemplate<RequestInfoStatic>()({
  translate(lng, { type, email, message, subject }) {
    return {
      subject,
      headerHtml: i18n.t('backend:email.received_request.title', { appName: appConfig.name, type, lng }),
      email,
      message,
      supportText: i18n.t('backend:email.support_email', { lng }),
    };
  },
  component({ subject, headerHtml, email, message, supportText }) {
    return (
      <EmailContainer previewText={subject}>
        <EmailHeader headerText={<SafeHtml html={headerHtml} policy="inline" as="div" />} />
        <EmailBody>
          <EmailText>Email: {email}</EmailText>
          {message && <EmailText>{message}</EmailText>}
        </EmailBody>

        <EmailLogo />
        <EmailFooter supportText={supportText} />
      </EmailContainer>
    );
  },
  preview: {
    statics: { type: 'contact', email: 'test@example.com', message: 'Hello', subject: 'New contact request' },
    recipient: {},
  },
});
