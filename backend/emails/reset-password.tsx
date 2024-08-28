import { Link, Section, Text } from 'jsx-email';

import { config } from 'config';
import type { i18n } from '../../backend/src/lib/i18n';

import { EmailContainer } from './components/container';
import { EmailButton } from './components/email-button';
import { EmailReplyTo } from './components/email-reply-to';
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
        color: '#404040',
        lineHeight: '1.5',
        width: '32rem',
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
      <EmailReplyTo />
      <Footer />
    </EmailContainer>
  );
};

export default ResetPasswordEmail;
