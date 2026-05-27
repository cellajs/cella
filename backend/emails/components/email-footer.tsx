import { Link } from 'jsx-email';
import { appConfig } from 'shared';
import { smallTextStyle } from '../styles';
import { EmailText } from './email-text';

/**
 * EmailFooter component with company address and support email link.
 */
export const EmailFooter = ({ supportText }: { supportText: string }) => (
  <EmailText
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
      {supportText}
    </Link>
  </EmailText>
);

// Template export
export const Template = EmailFooter;
