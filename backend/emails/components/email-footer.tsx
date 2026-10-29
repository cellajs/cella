import { appConfig } from 'shared';
import { smallTextStyle } from '../styles';
import { EmailText } from './email-text';
import { Link } from './primitives';

// #666 keeps 4.5:1 on the #f5f5f5 page background.
const lineStyle: React.CSSProperties = { ...smallTextStyle, color: '#666', textAlign: 'center', margin: '0 0 0.75rem' };
const linkStyle: React.CSSProperties = { ...smallTextStyle, color: '#666', textDecoration: 'underline' };

/** "Sent to <address> by <app>" with the support link on one line, then the postal address. */
export const EmailFooter = ({ supportText, sentTo }: { supportText: string; sentTo?: string }) => (
  <div style={{ marginTop: '2rem', maxWidth: '400px', padding: '0 1.5rem 2.5rem' }}>
    <EmailText className="email-muted" style={lineStyle}>
      {sentTo ?? appConfig.name}・
      <Link style={linkStyle} href={`mailto:${appConfig.supportEmail}`}>
        {supportText}
      </Link>
    </EmailText>
    <EmailText className="email-muted" style={{ ...lineStyle, margin: 0 }}>
      {appConfig.company.streetAddress}・{appConfig.company.city}・{appConfig.company.country}, {appConfig.company.postcode}
    </EmailText>
  </div>
);
