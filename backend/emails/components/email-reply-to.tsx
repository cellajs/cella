import { config } from 'config';
import { Text } from 'jsx-email';
import { i18n } from '../../../backend/src/lib/i18n';

export const EmailReplyTo = ({ email }: { email: string }) => (
  <>
    <Text style={{ fontSize: '.75rem', lineHeight: '1.13rem', color: '#6a737d', marginTop: '1.25rem', gap: '0.25rem' }}>
      {i18n.t('backend:email.invite_reply_to')}
      <a style={{ marginLeft: '0.25rem' }} href={`mailto:${email}`}>
        {email}
      </a>
      {' or '}
      <a style={{ marginLeft: '0.25rem' }} href={`mailto:${config.supportEmail}`}>
        {config.supportEmail}
      </a>
    </Text>
    <Text style={{ fontSize: '.75rem', lineHeight: '1.13rem', color: '#6a737d', marginTop: '1.25rem' }}>{i18n.t('backend:email.invite_expire')}</Text>
  </>
);
