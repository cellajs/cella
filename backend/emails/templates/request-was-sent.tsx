import { appConfig } from 'shared';
import type { requestTypeEnum } from '#/db/schema/requests';
import { EmailBody, EmailContainer, EmailFooter, EmailHeader, EmailLogo, EmailText, SafeHtml } from '../components';
import i18n from '../i18n';
import { defineEmailTemplate } from '../types';

export type RequestType = (typeof requestTypeEnum)[number];

interface RequestResponseStatic {
  type: RequestType;
  message: string | null;
}

/**
 * Email template for responses to user requests such as waitlist signups, newsletter subscriptions, or contact form submissions.
 */
export const requestResponseEmail = defineEmailTemplate<RequestResponseStatic>()({
  translate(lng, { type }) {
    return {
      subject: i18n.t('backend:email.request.subject', { lng, appName: appConfig.name, requestType: type }),
      headerHtml: i18n.t(`backend:email.${type}_request.title`, { lng }),
      bodyHtml: i18n.t(`backend:email.${type}_request.text`, { lng, appName: appConfig.name }),
      supportText: i18n.t('backend:email.support_email', { lng }),
    };
  },
  component({ subject, headerHtml, bodyHtml, supportText }) {
    return (
      <EmailContainer previewText={subject}>
        <EmailHeader headerText={<SafeHtml html={headerHtml} policy="inline" as="div" />} />
        <EmailBody>
          <EmailText>
            <SafeHtml html={bodyHtml} policy="inline" />
          </EmailText>
        </EmailBody>

        <EmailLogo />
        <EmailFooter supportText={supportText} />
      </EmailContainer>
    );
  },
  preview: {
    statics: { type: 'contact', message: null },
    recipient: {},
  },
});
