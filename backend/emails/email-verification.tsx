import { Section, Text } from 'jsx-email';

import { config } from 'config';
import { i18n } from '../../backend/src/lib/i18n';

import { AppLogo } from './components/app-logo';
import { EmailContainer } from './components/container';
import { EmailButton } from './components/email-button';
import { EmailReplyTo } from './components/email-reply-to';
import { Footer } from './components/footer';
import type { BasicTemplateType } from './types';

const baseUrl = config.frontendUrl;

interface Props extends BasicTemplateType {
  verificationLink: string;
}

export const VerificationEmail = ({ userLanguage, verificationLink = baseUrl }: Props) => {
  return (
    <EmailContainer
      previewText={i18n.t('backend:email.please_verify_email', { appName: config.name, lng: userLanguage })}
      bodyStyle={{
        padding: '0.625rem 0',
      }}
      containerStyle={{
        padding: '3rem',
        fontWeight: 300,
        color: '#404040',
        lineHeight: '1.5',
      }}
    >
      <AppLogo />
      <Section
        style={{
          borderRadius: '0.25rem',
          borderWidth: '1px',
          borderStyle: 'solid',
          borderColor: '#eaeaea',
          padding: '1.5rem',
          marginTop: '2rem',
        }}
      >
        <Text>{i18n.t('backend:email.verification_text_1', { lng: userLanguage })}</Text>
        <EmailButton ButtonText={i18n.t('common:verify_my_email', { lng: userLanguage })} href={verificationLink} />
      </Section>
      <EmailReplyTo />
      <Footer />
    </EmailContainer>
  );
};

export default VerificationEmail;
