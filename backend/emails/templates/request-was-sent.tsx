import { appConfig } from 'shared';
import type { requestTypeEnum } from '#/modules/requests/requests-db';
import { EmailMessage } from '../components';
import { i18n, plainText } from '../i18n';
import { defineEmailTemplate } from '../types';

export type RequestType = (typeof requestTypeEnum)[number];

interface RequestResponseStatic {
  type: RequestType;
  message: string | null;
}

/** Confirms a waitlist signup, newsletter subscription, or contact form submission. */
export const requestResponseEmail = defineEmailTemplate<RequestResponseStatic>()({
  translate(lng, { type }) {
    return {
      subject: i18n.t('backend:email.request.subject', { lng, appName: appConfig.name, requestType: type, ...plainText }),
      headerHtml: i18n.t(`backend:email.${type}_request.title`, { lng }),
      bodyHtml: i18n.t(`backend:email.${type}_request.text`, { lng, appName: appConfig.name }),
      supportText: i18n.t('backend:email.support_email', { lng }),
    };
  },
  component({ subject, headerHtml, bodyHtml, supportText }) {
    return <EmailMessage previewText={subject} headerHtml={headerHtml} bodyHtml={bodyHtml} supportText={supportText} />;
  },
  preview: { statics: { type: 'contact', message: null }, recipient: {} },
});
