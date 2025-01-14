import { Section, Text } from 'jsx-email';

import { config } from 'config';
import { i18n } from '../src/lib/i18n';

import { AppLogo } from './components/app-logo';
import { EmailContainer } from './components/container';
import { EmailButton } from './components/email-button';
import { Footer } from './components/footer';
import type { BasicTemplateType } from './types';

const baseUrl = config.frontendUrl;
const appName = config.name;

interface Props extends BasicTemplateType {
  verificationLink: string;
}

export const VerificationEmail = ({ userLanguage: lng, verificationLink = baseUrl }: Props) => {
  return (
    <EmailContainer
      previewText={i18n.t('backend:email.please_verify_email', { appName, lng })}
      bodyStyle={{
        padding: '0.625rem 0',
      }}
      containerStyle={{
        padding: '3rem',
        fontWeight: 300,
        color: '#404040',
        lineHeight: '1.5',
        width: '32rem',
      }}
    >
      <Section
        style={{
          borderRadius: '0.75rem',
          borderWidth: '1px',
          borderStyle: 'solid',
          borderColor: '#eaeaea',
          padding: '1.5rem',
          marginTop: '2rem',
        }}
      >
        <Text>{i18n.t('backend:email.verification_text_1', { lng, appName })}</Text>

        <EmailButton ButtonText={i18n.t('common:verify_my_email', { lng })} href={verificationLink} />
      </Section>
      <AppLogo />
      <Footer />
    </EmailContainer>
  );
};

// Template export
export const Template = VerificationEmail;
