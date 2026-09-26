import { appConfig } from 'shared';
import {
  EmailBody,
  EmailButton,
  EmailContainer,
  EmailFooter,
  EmailHeader,
  EmailLogo,
  EmailText,
  SafeHtml,
} from '../components';
import { i18n, plainText } from '../i18n';
import { greetingStyle } from '../styles';
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
      headerText: i18n.t('backend:email.step_up.title', { lng, appName, ...plainText }),
      hiText: name ? i18n.t('backend:email.hi', { lng, name, ...plainText }) : '',
      bodyHtml: i18n.t('backend:email.step_up.text', { lng, appName }),
      buttonText: i18n.t('c:confirm', { lng }),
      supportText: i18n.t('backend:email.support_email', { lng }),
      stepUpUrl,
    };
  },
  component({ previewText, headerText, hiText, bodyHtml, buttonText, stepUpUrl, supportText }) {
    return (
      <EmailContainer previewText={previewText}>
        <EmailHeader headerText={headerText} />
        <EmailBody>
          {hiText && <EmailText style={greetingStyle}>{hiText}</EmailText>}
          <EmailText>
            <SafeHtml html={bodyHtml} policy="inline" />
          </EmailText>
          <EmailButton ButtonText={buttonText} href={stepUpUrl} />
        </EmailBody>
        <EmailLogo />
        <EmailFooter supportText={supportText} />
      </EmailContainer>
    );
  },
  preview: {
    statics: { stepUpUrl: 'https://example.com/step-up', name: 'Emily' },
    recipient: {},
  },
});
