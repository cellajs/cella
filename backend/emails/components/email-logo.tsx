import { Img } from 'jsx-email';
import type { JSX } from 'react';
import { appConfig } from 'shared';

const logoUrl = `${appConfig.productionUrl}/static/logo/logo.png`;

/**
 * Email logo component using an image with a text fallback.
 * When images are blocked by the email client, the alt text is shown instead.
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
    <Img
      src={logoUrl}
      alt={appConfig.name}
      width="120"
      height="auto"
      style={{
        display: 'block',
        outline: 'none',
        border: 'none',
        textDecoration: 'none',
      }}
    />
  </a>
);

// Template export
export const Template = EmailLogo;
