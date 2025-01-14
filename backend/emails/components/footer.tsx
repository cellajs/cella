import { Link, Text } from 'jsx-email';

import { config } from 'config';
import { i18n } from '#/lib/i18n';

export const Footer = ({ style }: { style?: React.CSSProperties }) => (
  <Text
    style={{
      color: '#6a737d',
      fontSize: '0.75rem',
      textAlign: 'center' as const,
      marginTop: '2rem',
      padding: '0rem 1.5rem',
      ...style,
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
