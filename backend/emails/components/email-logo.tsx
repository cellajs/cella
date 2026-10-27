import type { JSX } from 'react';
import { appConfig } from 'shared';
import { Img } from './primitives';

// Mail clients never recolor an image: the logo sits on a light tile baked into the file, legible on any background.
const logoUrl = `${appConfig.productionUrl}/static/common/logo/logo-email.png`;
const darkLogoUrl = `${appConfig.productionUrl}/static/common/logo/logo-email-dark.png`;
// An Outlook-only property React's style type does not know; the renderer writes it as `mso-hide`.
const outlookHidden = { msoHide: 'all' };

/**
 * Email logo component using an image with a text fallback.
 * The alt text remains visible when the email client blocks images. The light version replaces it only under the mail's
 * own dark styles; Outlook for Windows never draws it (`mso-hide`).
 */
export const EmailLogo = ({ style }: { style?: React.CSSProperties }): JSX.Element => (
  <a
    href={appConfig.aboutUrl}
    target="_blank"
    rel="noreferrer"
    style={{ display: 'inline-block', marginTop: '2rem', textDecoration: 'none', ...style }}
  >
    <Img
      className="email-logo"
      src={logoUrl}
      alt={appConfig.name}
      width="136"
      height="52"
      style={{ display: 'block', outline: 'none', border: 'none', textDecoration: 'none' }}
    />
    <Img
      className="email-logo-dark"
      src={darkLogoUrl}
      alt=""
      width="136"
      height="52"
      style={{ display: 'none', maxHeight: 0, overflow: 'hidden', border: 'none', ...outlookHidden }}
    />
  </a>
);
