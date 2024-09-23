import { config } from 'config';
import { Link, Text } from 'jsx-email';
import { i18n } from '../../../backend/src/lib/i18n';
import { AppLogo } from './app-logo';

const link = {
  color: '#0366d6',
  fontSize: '.75rem',
  lineHeight: '1.13rem',
};

export const EmailReplyTo = ({ email }: { email?: string }) => (
  <>
    <AppLogo />
    <Text style={{ marginTop: '1.25rem', gap: '0.25rem', textAlign: 'center' as const }}>
      {email && (
        <Link style={link} href={`mailto:${email}`}>
          {i18n.t('backend:email.inviter_email')}
        </Link>
      )}
      ・
      <Link style={link} href={`mailto:${config.supportEmail}`}>
        {i18n.t('backend:email.support_email')}
      </Link>
      {!email && '・'}
    </Text>
  </>
);
