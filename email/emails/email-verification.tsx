import { Section, Text } from '@react-email/components';

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
      bodyClassName="py-2.5"
      containerClassName="border-[#f0f0f0] p-12 font-light text-[#404040] leading-6"
    >
      <Logo />
      <Section>
        <Text>{i18n.t('backend:email.verification_text_1')}</Text>
        <EmailButton ButtonText={i18n.t('common:verify_my_email')} href={verificationLink} />
      </Section>
      <Footer hrClassName="mt-6" />
    </EmailContainer>
  );
};

export default VerificationEmail;
