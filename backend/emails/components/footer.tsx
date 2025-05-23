import { config } from 'config';
import i18n from 'i18next';
import { Link, Text } from 'jsx-email';

export const Footer = () => (
  <Text
    style={{
      color: '#777',
      fontSize: '0.75rem',
      textAlign: 'center' as const,
      marginTop: '2rem',
      maxWidth: '400px',
      padding: '0rem 1.5rem',
    }}
  >
    {config.name}・{config.company.streetAddress}・{config.company.city}・{config.company.country}, {config.company.postcode}・
    <Link
      style={{
        color: '#0366d6',
        fontSize: '.75rem',
        lineHeight: '1.13rem',
      }}
      href={`mailto:${config.supportEmail}`}
    >
      {i18n.t('backend:email.support_email')}
    </Link>
  </Text>
);

// Template export
export const Template = Footer;
