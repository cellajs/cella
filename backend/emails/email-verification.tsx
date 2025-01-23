import { Text } from 'jsx-email';

import { config } from 'config';
import { i18n } from '../src/lib/i18n';

import { AppLogo } from './components/app-logo';
import { EmailContainer } from './components/container';
import { EmailBody } from './components/email-body';
import { EmailButton } from './components/email-button';
import { Footer } from './components/footer';
import type { BasicTemplateType } from './types';

const baseUrl = config.frontendUrl;
const appName = config.name;

interface Props extends BasicTemplateType {
  verificationLink: string;
}

export const EmailVerificationEmail = ({ userLanguage: lng, verificationLink = baseUrl }: Props) => {
  return (
    <EmailContainer previewText={i18n.t('backend:email.email_verification.preview', { appName, lng })}>
      <EmailBody>
        <Text>
          <span
            // biome-ignore lint/security/noDangerouslySetInnerHtml: <explanation>
            dangerouslySetInnerHTML={{
              __html: i18n.t('backend:email.email_verification.text', { lng, appName }),
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
