import { appConfig } from 'config';
import { Img } from 'jsx-email';
import type { JSX } from 'react';

export const AppLogo = ({ style }: { style?: React.CSSProperties }): JSX.Element => (
  <a href={appConfig.aboutUrl} target="_blank" rel="noreferrer" style={{ marginTop: '2rem' }}>
    <Img src={`${appConfig.productionUrl}/static/logo/logo-small.png`} alt={appConfig.name} style={{ margin: '0 auto', height: '30px', ...style }} />
  </a>
);

// Template export
export const Template = AppLogo;
