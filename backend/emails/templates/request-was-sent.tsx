import type { requestKinds } from '#/modules/requests/requests-db';
import { EmailMessage } from '../components';
import { i18n, plainText } from '../i18n';
import { endingFor } from '../shared-texts';
import { defineEmailTemplate } from '../types';

export type RequestKind = (typeof requestKinds)[number];

interface RequestResponseStatic {
  kind: RequestKind;
}

/**
 * Confirms a waitlist signup, info request or contact form submission. Anyone can type any address into the
 * form, so the mail never repeats what they typed.
 */
export const requestResponseEmail = defineEmailTemplate<RequestResponseStatic>()({
  translate(lng, { kind }) {
    const subject = i18n.t('backend:email.request.subject', { lng, requestKind: kind, ...plainText });
    return {
      subject,
      previewText: subject,
      headerHtml: i18n.t(`backend:email.${kind}_request.title`, { lng }),
      bodyHtml: i18n.t(`backend:email.${kind}_request.text`, { lng }),
      endingHtml: endingFor(lng, 'reply'),
      supportText: i18n.t('backend:email.support_email', { lng }),
    };
  },
  component({ previewText, headerHtml, bodyHtml, endingHtml, supportText, frame }) {
    return (
      <EmailMessage
        frame={frame}
        previewText={previewText}
        headerHtml={headerHtml}
        bodyHtml={bodyHtml}
        endingHtml={endingHtml}
        supportText={supportText}
      />
    );
  },
  requestDetails: true,
  preview: { statics: { kind: 'contact' }, recipient: {} },
  previewVariants: {
    waitlist: { statics: { kind: 'waitlist' }, recipient: {} },
    info: { statics: { kind: 'info' }, recipient: {} },
  },
});
