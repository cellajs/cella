import { appConfig } from 'shared';
import type { requestTypeEnum } from '#/modules/requests/requests-db';
import { EmailMessage } from '../components';
import { i18n, plainText } from '../i18n';
import { endingFor } from '../shared-texts';
import { defineEmailTemplate } from '../types';

export type RequestType = (typeof requestTypeEnum)[number];

interface RequestResponseStatic {
  type: RequestType;
}

/**
 * Confirms a waitlist signup, newsletter subscription, or contact form submission. Anyone can type any address into the
 * form, so the mail never repeats what they typed.
 */
export const requestResponseEmail = defineEmailTemplate<RequestResponseStatic>()({
  translate(lng, { type }) {
    return {
      subject: i18n.t('backend:email.request.subject', { lng, appName: appConfig.name, requestType: type, ...plainText }),
      headerHtml: i18n.t(`backend:email.${type}_request.title`, { lng }),
      bodyHtml: i18n.t(`backend:email.${type}_request.text`, { lng, appName: appConfig.name }),
      endingHtml: endingFor(lng, 'reply'),
      supportText: i18n.t('backend:email.support_email', { lng }),
    };
  },
  component({ subject, headerHtml, bodyHtml, endingHtml, supportText, frame }) {
    return (
      <EmailMessage
        frame={frame}
        previewText={subject}
        headerHtml={headerHtml}
        bodyHtml={bodyHtml}
        endingHtml={endingHtml}
        supportText={supportText}
      />
    );
  },
  requestDetails: true,
  preview: { statics: { type: 'contact' }, recipient: {} },
});
