import { appConfig } from 'shared';
import { EmailBody, EmailButton, EmailContainer, EmailHeader, EmailLogo, Footer, Text } from '../components';
import i18n from '../i18n';
import { greetingStyle } from '../styles';
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
        {name && <Text style={greetingStyle}>{i18n.t('backend:email.hi', { lng, name })}</Text>}
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

// Preview props for jsx-email CLI
export const previewProps = {
  lng: 'en',
  subject: 'Verify your email',
  name: 'Emily',
  verificationLink: 'https://cellajs.com/auth/verify?token=preview-token',
  email: 'jane@example.com',
} satisfies EmailVerificationEmailProps;
