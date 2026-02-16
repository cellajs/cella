import i18n from 'i18next';
import { Text } from 'jsx-email';
import { appConfig } from 'shared';
import { EmailBody, EmailButton, EmailContainer, EmailHeader, EmailLogo, Footer } from '../components';
import type { BasicTemplateType } from '../types';

const appName = appConfig.name;

interface EmailVerificationEmailProps extends BasicTemplateType {
  name: string;
  verificationLink: string;
  email: string;
}

/**
 * Email template for users to verify ownership of this email address.
 */
export const EmailVerificationEmail = ({ lng, verificationLink, email, name }: EmailVerificationEmailProps) => {
  return (
    <EmailContainer previewText={i18n.t('backend:email.email_verification.preview', { appName, lng })}>
      <EmailHeader headerText={i18n.t('backend:email.email_verification.title', { appName, lng })} />
      <EmailBody>
        <Text>
          <span
            dangerouslySetInnerHTML={{
              __html: i18n.t('backend:email.email_verification.text', { lng, appName, email, name }),
            }}
          />
        </Text>

        <EmailButton ButtonText={i18n.t('common:verify_my_email', { lng })} href={verificationLink} />
      </EmailBody>
      <EmailLogo />
      <Footer />
    </EmailContainer>
  );
};

// Template export
export const Template = EmailVerificationEmail;
