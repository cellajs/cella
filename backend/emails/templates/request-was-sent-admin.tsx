import { appConfig } from 'shared';
import { EmailLayout, EmailText } from '../components';
import { i18n } from '../i18n';
import { defineEmailTemplate } from '../types';
import type { RequestType } from './request-was-sent';

interface RequestInfoStatic {
  type: RequestType;
  email: string;
  message: string | null;
  subject: string;
}

/** Notifies sysadmin of a waitlist signup, newsletter subscription, or contact form submission. */
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
      <EmailLayout previewText={subject} headerHtml={headerHtml} supportText={supportText}>
        <EmailText>Email: {email}</EmailText>
        {message && <EmailText>{message}</EmailText>}
      </EmailLayout>
    );
  },
  preview: { statics: { type: 'contact', email: 'test@example.com', message: 'Hello', subject: 'New contact request' }, recipient: {} },
});
