import { appConfig } from 'config';
import i18n from 'i18next';
import { Text } from 'jsx-email';
import type { BasicTemplateType } from '../src/lib/mailer';
import { AppLogo } from './components/app-logo';
import { EmailContainer } from './components/container';
import { EmailBody } from './components/email-body';
import { EmailButton } from './components/email-button';
import { EmailHeader } from './components/email-header';
import { Footer } from './components/footer';

const appName = appConfig.name;

export interface EmailVerificationEmailProps extends BasicTemplateType {
  verificationLink: URL;
  email: string;
}

export const EmailVerificationEmail = ({ lng, verificationLink, email }: EmailVerificationEmailProps) => {
  return (
    <EmailContainer previewText={i18n.t('backend:email.email_verification.preview', { appName, lng })}>
      <EmailHeader headerText={i18n.t('backend:email.email_verification.preview', { appName, lng })} />
      <EmailBody>
        <Text>
          <span
            // biome-ignore lint/security/noDangerouslySetInnerHtml: trusted HTML content from a secure source
            dangerouslySetInnerHTML={{
              __html: i18n.t('backend:email.email_verification.text', { lng, appName, email }),
            }}
          />
        </Text>

        <EmailButton ButtonText={i18n.t('common:verify_my_email', { lng })} href={verificationLink} />
      </EmailBody>
      <AppLogo />
      <Footer />
    </EmailContainer>
  );
};

// Template export
export const Template = EmailVerificationEmail;
