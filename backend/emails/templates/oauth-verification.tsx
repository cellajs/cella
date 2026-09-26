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
import { defineEmailTemplate, type EmailRecipient, plainParam } from '../types';

const appName = appConfig.name;

interface OAuthVerificationStatic {
  name: string;
  verificationLink: string;
  providerEmail: string;
  providerName: string;
}

export const oauthVerificationEmail = defineEmailTemplate<
  OAuthVerificationStatic,
  EmailRecipient & { email: string }
>()({
  translate(lng, { name, verificationLink, providerEmail, providerName }, param = plainParam) {
    return {
      subject: i18n.t('backend:email.oauth_verification.subject', { lng, appName, ...plainText }),
      previewText: i18n.t('backend:email.oauth_verification.preview', { appName, lng, providerName, ...plainText }),
      headerText: i18n.t('backend:email.oauth_verification.preview', { appName, lng, providerName, ...plainText }),
      hiText: name ? i18n.t('backend:email.hi', { lng, name, ...plainText }) : '',
      bodyHtml: i18n.t('backend:email.oauth_verification.text', {
        lng,
        appName,
        email: param('email'),
        providerEmail,
        providerName,
        name,
      }),
      buttonText: i18n.t('backend:email.oauth_verification.verify', { lng, providerName, ...plainText }),
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
    statics: {
      verificationLink: 'https://example.com/verify',
      name: 'Emily',
      providerEmail: 'jane@gmail.com',
      providerName: 'Google',
    },
    recipient: {},
  },
});
