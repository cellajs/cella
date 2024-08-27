import { Section, Text } from 'jsx-email';

import { config } from 'config';
import type { i18n } from '../../backend/src/lib/i18n';

import { EmailContainer } from './components/container';
import { EmailButton } from './components/email-button';
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
        paddingTop: '0.625rem',
        paddingBottom: '0.625rem',
      }}
      containerStyle={{
        borderColor: '#f0f0f0',
        padding: '3rem',
        fontWeight: 300,
        color: '#404040',
        lineHeight: '1.5',
      }}
    >
      <Logo />
      <Section>
        <Text>{i18n.t('backend:email.verification_text_1')}</Text>
        <EmailButton ButtonText={i18n.t('common:verify_my_email')} href={verificationLink} />
      </Section>
      <Footer hrStyle={{ marginTop: '1.5rem' }} />
    </EmailContainer>
  );
};

export default VerificationEmail;
