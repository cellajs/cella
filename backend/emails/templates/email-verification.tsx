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
import { i18n } from '../i18n';
import { greetingStyle } from '../styles';
import { defineEmailTemplate, type EmailRecipient } from '../types';

const appName = appConfig.name;

interface EmailVerificationStatic {
  verificationLink: string;
  name: string;
}

/**
 * Email template for users to verify ownership of this email address.
 */
export const emailVerificationEmail = defineEmailTemplate<
  EmailVerificationStatic,
  EmailRecipient & { email: string }
>()({
  translate(lng, { verificationLink, name }) {
    return {
      subject: i18n.t('backend:email.email_verification.subject', { lng, appName }),
      previewText: i18n.t('backend:email.email_verification.preview', { appName, lng }),
      headerText: i18n.t('backend:email.email_verification.title', { appName, lng }),
      hiText: name ? i18n.t('backend:email.hi', { lng, name }) : '',
      bodyHtml: i18n.t('backend:email.email_verification.text', { lng, appName, email: '{{params.email}}', name }),
      buttonText: i18n.t('c:verify_my_email', { lng }),
      supportText: i18n.t('backend:email.support_email', { lng }),
      verificationLink,
    };
  },
  component({ previewText, headerText, hiText, bodyHtml, buttonText, verificationLink, supportText }) {
    return (
      <EmailContainer previewText={previewText}>
        <EmailHeader headerText={headerText} />
        <EmailBody>
          {hiText && <EmailText style={greetingStyle}>{hiText}</EmailText>}
          <EmailText>
            <SafeHtml html={bodyHtml} policy="inline" />
          </EmailText>
          <EmailButton ButtonText={buttonText} href={verificationLink} />
        </EmailBody>
        <EmailLogo />
        <EmailFooter supportText={supportText} />
      </EmailContainer>
    );
  },
  preview: {
    statics: { verificationLink: 'https://example.com/verify', name: 'Emily' },
    recipient: {},
  },
});
