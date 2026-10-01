import { appConfig } from 'shared';
import { EmailMessage } from '../components';
import { i18n, plainText } from '../i18n';
import { defineEmailTemplate, type EmailRecipient } from '../types';

const appName = appConfig.name;

interface StepUpStatic {
  stepUpUrl: string;
  name: string;
}

export const stepUpEmail = defineEmailTemplate<StepUpStatic, EmailRecipient & { email: string }>()({
  translate(lng, { stepUpUrl, name }) {
    return {
      subject: i18n.t('backend:email.step_up.subject', { lng, appName, ...plainText }),
      previewText: i18n.t('backend:email.step_up.preview', { lng, appName, ...plainText }),
      headerHtml: i18n.t('backend:email.step_up.title', { lng, appName }),
      hiText: name ? i18n.t('backend:email.hi', { lng, name, ...plainText }) : '',
      bodyHtml: i18n.t('backend:email.step_up.text', { lng, appName }),
      buttonText: i18n.t('c:confirm', { lng }),
      supportText: i18n.t('backend:email.support_email', { lng }),
      stepUpUrl,
    };
  },
  component({ previewText, headerHtml, hiText, bodyHtml, buttonText, stepUpUrl, supportText }) {
    return (
      <EmailMessage
        previewText={previewText}
        headerHtml={headerHtml}
        greeting={hiText}
        bodyHtml={bodyHtml}
        action={{ label: buttonText, href: stepUpUrl }}
        supportText={supportText}
      />
    );
  },
  preview: { statics: { stepUpUrl: 'https://example.com/step-up', name: 'Emily' }, recipient: {} },
});
