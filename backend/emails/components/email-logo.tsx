import type { JSX } from 'react';
import { appConfig } from 'shared';
import { Img } from './primitives';

const logoUrl = `${appConfig.productionUrl}/static/common/logo/logo.png`;

/**
 * Email logo component using an image with a text fallback.
 * The alt text remains visible when the email client blocks images.
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
