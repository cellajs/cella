import { Link } from 'jsx-email';
import { appConfig } from 'shared';
import i18n from '../i18n';
import { smallTextStyle } from '../styles';
import { Text } from './email-text';

/**
 * Email footer component with company address and support email link.
 */
export const Footer = () => (
  <Text
    style={{
      ...smallTextStyle,
      color: '#777',
      textAlign: 'center' as const,
      marginTop: '2rem',
      maxWidth: '400px',
      padding: '0 1.5rem',
    }}
  >
    {appConfig.name}・{appConfig.company.streetAddress}・{appConfig.company.city}・{appConfig.company.country},{' '}
    {appConfig.company.postcode}・
    <Link
      style={{
        ...smallTextStyle,
        color: '#0366d6',
      }}
      href={`mailto:${appConfig.supportEmail}`}
    >
      {i18n.t('backend:email.support_email')}
    </Link>
  </Text>
);

// Template export
export const Template = Footer;
