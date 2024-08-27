import { Link, Section, Text } from 'jsx-email';

import { config } from 'config';
import type { i18n } from '../../backend/src/lib/i18n';

import { EmailContainer } from './components/container';
import { EmailButton } from './components/email-button';
import { Footer } from './components/footer';
import { Logo } from './components/logo';

interface Props {
  i18n: typeof i18n;
  username?: string;
  resetPasswordLink: string;
}

const baseUrl = config.frontendUrl;
const resetPasswordUrl = `${baseUrl}/auth/reset-password`;

export const ResetPasswordEmail = ({ i18n, username, resetPasswordLink = baseUrl }: Props) => {
  username = username || i18n.t('common:unknown_name');

  return (
    <EmailContainer
      previewText={i18n.t('backend:email.please_verify_email')}
      bodyStyle={{ padding: '0 0.625rem' }}
      containerStyle={{
        borderColor: '#f0f0f0',
        padding: '2.5rem',
        maxWidth: '100%',
        color: '#404040',
        lineHeight: '1.5',
      }}
    >
      <Logo />
      <Section>
        <Text>
          {i18n.t('backend:email.hi')} {username},
        </Text>
        <Text>{i18n.t('backend:email.reset_password_text_1')}</Text>
        <EmailButton ButtonText={i18n.t('common:reset_password')} href={resetPasswordLink} />
        <Text>
          {i18n.t('backend:email.reset_password_text_2')} <Link href={resetPasswordUrl}>{resetPasswordUrl}</Link>
        </Text>
        <Text>{i18n.t('backend:email.reset_password_text_3')}</Text>
      </Section>
      <Footer />
    </EmailContainer>
  );
};

export default ResetPasswordEmail;
