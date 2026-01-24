import { appConfig } from 'config';
import i18n from 'i18next';
import { Text } from 'jsx-email';
import { EmailBody, EmailButton, EmailContainer, EmailHeader, EmailLogo, Footer } from '../components';
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
        <Text>
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
        </Text>
        <EmailButton
          ButtonText={i18n.t('backend:email.oauth_verification.verify', { lng, providerName })}
          href={verificationLink}
        />
      </EmailBody>

      <EmailLogo />
      <Footer />
    </EmailContainer>
  );
};

// Template export
export const Template = OAuthVerificationEmail;
