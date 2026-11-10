import { EmailLayout, EmailText } from '../components';
import { i18n } from '../i18n';
import { defineEmailTemplate } from '../types';
import type { RequestKind } from './request-was-sent';

interface RequestReceivedStatic {
  kind: RequestKind;
  email: string;
  message: string | null;
  subject: string;
}

/** Notifies the team of a waitlist signup, info request or contact form submission. */
export const requestReceivedEmail = defineEmailTemplate<RequestReceivedStatic>()({
  translate(lng, { kind, email, message, subject }) {
    return {
      subject,
      previewText: subject,
      headerHtml: i18n.t('backend:email.received_request.title', { kind, lng }),
      email,
      message,
      supportText: i18n.t('backend:email.support_email', { lng }),
    };
  },
  component({ previewText, headerHtml, email, message, supportText, frame }) {
    return (
      <EmailLayout frame={frame} previewText={previewText} headerHtml={headerHtml} supportText={supportText}>
        <EmailText>Email: {email}</EmailText>
        {message && <EmailText>{message}</EmailText>}
      </EmailLayout>
    );
  },
  requestDetails: true,
  preview: { statics: { kind: 'contact', email: 'test@example.com', message: 'Hello', subject: 'New contact request' }, recipient: {} },
});
