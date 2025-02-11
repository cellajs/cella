import { Img } from 'jsx-email';

import { config } from 'config';

export const AppLogo = ({ style }: { style?: React.CSSProperties }) => (
  <a href={config.aboutUrl} target="_blank" rel="noreferrer" style={{ marginTop: '2rem' }}>
    <Img src={`${config.productionUrl}/static/logo/logo-small.png`} alt={config.name} style={{ margin: '0 auto', height: '30px', ...style }} />
  </a>
);

// Template export
export const Template = AppLogo;
