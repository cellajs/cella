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
import i18n from '../i18n';
import { greetingStyle } from '../styles';
import { defineEmailTemplate, type EmailRecipient } from '../types';

const appName = appConfig.name;

interface OAuthVerificationStatic {
  name: string;
  verificationLink: string;
  providerEmail: string;
  providerName: string;
}

/**
 * Email template for users to verify ownership of their email address that have been added via OAuth provider.
 */
export const oauthVerificationEmail = defineEmailTemplate<
  OAuthVerificationStatic,
  EmailRecipient & { email: string }
>()({
  translate(lng, { name, verificationLink, providerEmail, providerName }) {
    return {
      subject: i18n.t('backend:email.email_verification.subject', { lng, appName }),
      previewText: i18n.t('backend:email.oauth_verification.preview', { appName, lng, providerName }),
      headerText: i18n.t('backend:email.oauth_verification.preview', { appName, lng, providerName }),
      hiText: name ? i18n.t('backend:email.hi', { lng, name }) : '',
      bodyHtml: i18n.t('backend:email.oauth_verification.text', {
        lng,
        appName,
        email: '{{params.email}}',
        providerEmail,
        providerName,
        name,
      }),
      buttonText: i18n.t('backend:email.oauth_verification.verify', { lng, providerName }),
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
});
