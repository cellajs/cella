import { appConfig } from 'shared';
import { EmailBody, EmailButton, EmailContainer, EmailFooter, EmailHeader, EmailLogo, EmailText } from '../components';
import i18n from '../i18n';
import { greetingStyle } from '../styles';
import type { BasicTemplateType } from '../types';

const appName = appConfig.name;

interface OAuthVerificationEmailProps extends BasicTemplateType {
  name: string;
  verificationLink: string;
  email: string;
  providerEmail: string;
  providerName: string;
}

/**
 * Email template for users to verify ownership of their email address that have been added via OAuth provider.
 */
export const OAuthVerificationEmail = ({
  lng,
  verificationLink,
  email,
  name,
  providerEmail,
  providerName,
}: OAuthVerificationEmailProps) => {
  return (
    <EmailContainer previewText={i18n.t('backend:email.oauth_verification.preview', { appName, lng, providerName })}>
      <EmailHeader headerText={i18n.t('backend:email.oauth_verification.preview', { appName, lng, providerName })} />

      <EmailBody>
        {name && <EmailText style={greetingStyle}>{i18n.t('backend:email.hi', { lng, name })}</EmailText>}
        <EmailText>
          <span
            dangerouslySetInnerHTML={{
              __html: i18n.t('backend:email.oauth_verification.text', {
                lng,
                appName,
                email,
                providerEmail,
                providerName,
                name,
              }),
            }}
          />
        </EmailText>
        <EmailButton
          ButtonText={i18n.t('backend:email.oauth_verification.verify', { lng, providerName })}
          href={verificationLink}
        />
      </EmailBody>

      <EmailLogo />
      <EmailFooter />
    </EmailContainer>
  );
};

// Template export
export const Template = OAuthVerificationEmail;

// Preview props for jsx-email CLI
export const previewProps = {
  lng: 'en',
  subject: 'Verify your email',
  name: 'Emily',
  verificationLink: 'https://cellajs.com/auth/verify?token=preview-token',
  email: 'jane@example.com',
  providerEmail: 'jane@gmail.com',
  providerName: 'Google',
} satisfies OAuthVerificationEmailProps;
