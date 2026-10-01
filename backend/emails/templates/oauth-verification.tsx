import { appConfig } from 'shared';
import { EmailMessage } from '../components';
import { i18n, plainText } from '../i18n';
import { defineEmailTemplate, type EmailRecipient, plainParam } from '../types';

const appName = appConfig.name;

interface OAuthVerificationStatic {
  name: string;
  verificationLink: string;
  providerEmail: string;
  providerName: string;
  /** A sign-up whose account is created at the click; otherwise a provider account connecting to an existing one. */
  isNewUser: boolean;
}

export const oauthVerificationEmail = defineEmailTemplate<OAuthVerificationStatic, EmailRecipient & { email: string }>()({
  translate(lng, { name, verificationLink, providerEmail, providerName, isNewUser }, param = plainParam) {
    const keyBase = isNewUser ? 'backend:email.oauth_verification.signup' : 'backend:email.oauth_verification';
    return {
      subject: i18n.t(`${keyBase}.subject`, { lng, appName, ...plainText }),
      previewText: i18n.t(`${keyBase}.preview`, { appName, lng, providerName, ...plainText }),
      headerHtml: i18n.t(`${keyBase}.preview`, { appName, lng, providerName }),
      hiText: name ? i18n.t('backend:email.hi', { lng, name, ...plainText }) : '',
      bodyHtml: i18n.t(`${keyBase}.text`, { lng, appName, email: param('email'), providerEmail, providerName, name }),
      buttonText: i18n.t(`${keyBase}.verify`, { lng, providerName, ...plainText }),
      supportText: i18n.t('backend:email.support_email', { lng }),
      verificationLink,
    };
  },
  component({ previewText, headerHtml, hiText, bodyHtml, buttonText, verificationLink, supportText }) {
    return (
      <EmailMessage
        previewText={previewText}
        headerHtml={headerHtml}
        greeting={hiText}
        bodyHtml={bodyHtml}
        action={{ label: buttonText, href: verificationLink }}
        supportText={supportText}
      />
    );
  },
  preview: {
    statics: {
      verificationLink: 'https://example.com/verify',
      name: 'Emily',
      providerEmail: 'jane@gmail.com',
      providerName: 'Google',
      isNewUser: false,
    },
    recipient: {},
  },
});
