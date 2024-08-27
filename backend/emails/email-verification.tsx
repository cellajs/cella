import { Section, Text } from 'jsx-email';

import { config } from 'config';
import type { i18n } from '../../backend/src/lib/i18n';

import { EmailContainer } from './components/container';
import { EmailButton } from './components/email-button';
import { EmailReplyTo } from './components/email-reply-to';
import { Footer } from './components/footer';
import { Logo } from './components/logo';

interface Props {
  i18n: typeof i18n;
  verificationLink: string;
}

const baseUrl = config.frontendUrl;

export const VerificationEmail = ({ i18n, verificationLink = baseUrl }: Props) => {
  return (
    <EmailContainer
      previewText={i18n.t('backend:email.please_verify_email')}
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
      <Logo />
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
        <Text>{i18n.t('backend:email.verification_text_1')}</Text>
        <EmailButton ButtonText={i18n.t('common:verify_my_email')} href={verificationLink} />
      </Section>
      <EmailReplyTo />
      <Footer />
    </EmailContainer>
  );
};

export default VerificationEmail;
