import { Link, Section, Text } from 'jsx-email';

import { config } from 'config';
import { i18n } from '../../backend/src/lib/i18n';

import { AppLogo } from './components/app-logo';
import { EmailContainer } from './components/container';
import { EmailButton } from './components/email-button';
import { EmailReplyTo } from './components/email-reply-to';
import { Footer } from './components/footer';
import UserName from './components/user-name';
import type { BasicTemplateType } from './types';

interface Props extends BasicTemplateType {
  resetPasswordLink: string;
}

const baseUrl = config.frontendUrl;
const resetPasswordUrl = `${baseUrl}/auth/reset-password`;

export const ResetPasswordEmail = ({ userName, userLanguage, resetPasswordLink = baseUrl }: Props) => {
  return (
    <EmailContainer
      previewText={i18n.t('backend:email.please_verify_email', { appName: config.name, lng: userLanguage })}
      bodyStyle={{ padding: '0 0.625rem' }}
      containerStyle={{
        borderColor: '#f0f0f0',
        color: '#404040',
        lineHeight: '1.5',
        width: '32rem',
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
        <UserName userName={userName}>
          <Text>{i18n.t('backend:email.hi', { lng: userLanguage })}</Text>
        </UserName>
        <div
          // biome-ignore lint/security/noDangerouslySetInnerHtml: <explanation>
          dangerouslySetInnerHTML={{
            __html: i18n.t('backend:email.reset_password_text_1', { appName: config.name, lng: userLanguage }),
          }}
        />
        <EmailButton ButtonText={i18n.t('common:reset_password', { lng: userLanguage })} href={resetPasswordLink} />
        <Text>
          {i18n.t('backend:email.reset_password_text_2', { lng: userLanguage })} <Link href={resetPasswordUrl}>{resetPasswordUrl}</Link>
        </Text>
        <Text>{i18n.t('backend:email.reset_password_text_3', { lng: userLanguage })}</Text>
      </Section>
      <EmailReplyTo />
      <Footer />
    </EmailContainer>
  );
};

export default ResetPasswordEmail;
