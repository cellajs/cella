import { appConfig } from 'shared';
import type { DeliveryNoteStatic } from '../chat-text';
import { EmailLayout, EmailText } from '../components';
import { requestOrigin } from '../frame';
import { i18n, plainText } from '../i18n';
import { defineEmailTemplate } from '../types';
import type { RequestKind } from './request-was-sent';

interface RequestReceivedStatic extends DeliveryNoteStatic {
  kind: RequestKind;
  email: string;
  message: string | null;
  subject: string;
}

/** Notifies the team of a waitlist signup, info request or contact form submission. */
export const requestReceivedEmail = defineEmailTemplate<RequestReceivedStatic>()({
  translate(lng, { kind, email, message, subject, deliveryNote }) {
    return {
      subject,
      previewText: subject,
      headerHtml: i18n.t('backend:email.received_request.title', { kind, lng }),
      email,
      message,
      supportText: i18n.t('backend:email.support_email', { lng }),
      endingHtml: deliveryNote,
    };
  },
  component({ previewText, headerHtml, email, message, supportText, endingHtml, frame }) {
    return (
      <EmailLayout frame={frame} previewText={previewText} headerHtml={headerHtml} supportText={supportText} endingHtml={endingHtml}>
        <EmailText>Email: {email}</EmailText>
        {message && <EmailText>{message}</EmailText>}
      </EmailLayout>
    );
  },
  chat(lng, { kind, email, message }, details) {
    const open = { label: i18n.t('backend:chat.request.open', { lng, ...plainText }), href: `${appConfig.frontendUrl}/system/requests` };
    const reply = { label: i18n.t('backend:chat.request.reply', { lng, ...plainText }), href: `mailto:${email}` };
    return {
      headlineHtml: i18n.t(`backend:chat.request.${kind}`, { email, lng }),
      quote: message,
      // Only a contact request holds a message to answer; the headline links the address for the other kinds.
      links: kind === 'contact' ? [reply, open] : [open],
      note: requestOrigin(lng, details),
    };
  },
  requestDetails: true,
  preview: { statics: { kind: 'contact', email: 'test@example.com', message: 'Hello', subject: 'New contact request' }, recipient: {} },
});
