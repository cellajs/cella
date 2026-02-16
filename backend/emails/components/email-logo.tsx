import type { JSX } from 'react';
import { appConfig } from 'shared';

/**
 * Email-safe logo component using styled HTML text instead of images.
 * Images often get blocked or display partially in email clients.
 * This approach uses a colored container with styled text for reliability.
 */
export const EmailLogo = ({ style }: { style?: React.CSSProperties }): JSX.Element => (
  <a
    href={appConfig.aboutUrl}
    target="_blank"
    rel="noreferrer"
    style={{
      display: 'inline-block',
      marginTop: '2rem',
      textDecoration: 'none',
      ...style,
    }}
  >
    <span
      style={{
        display: 'inline-block',
        padding: '8px 16px',
        backgroundColor: '#18181b',
        borderRadius: '6px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontSize: '18px',
        fontWeight: 700,
        letterSpacing: '-0.5px',
        color: '#ffffff',
      }}
    >
      {appConfig.name}
    </span>
  </a>
);

// Template export
export const Template = EmailLogo;
