import { appConfig } from 'config';
import i18n from 'i18next';
import { Link, Text } from 'jsx-email';
import { AppLogo } from './app-logo';

const link = {
  color: '#0366d6',
  fontSize: '.75rem',
  lineHeight: '1.13rem',
};

export const EmailReplyTo = ({ email, emailText }: { email?: string; emailText?: string }) => (
  <>
    <AppLogo />
    <Text
      style={{ marginTop: '1.25rem', gap: '0.25rem', textAlign: 'center' as const, alignItems: 'center', display: 'flex', justifyContent: 'center' }}
    >
      {email && (
        <Link style={link} href={`mailto:${email}`}>
          {emailText ? emailText : i18n.t('backend:email.inviter_email')}
        </Link>
      )}
      ・
      <Link style={link} href={`mailto:${appConfig.supportEmail}`}>
        {i18n.t('backend:email.support_email')}
      </Link>
      {!email && '・'}
    </Text>
  </>
);
