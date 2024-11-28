import { Img, Section } from 'jsx-email';

import { config } from 'config';

export const AppLogo = ({ style }: { style?: React.CSSProperties }) => (
  <Section style={{ marginTop: '2rem' }}>
    <Img src={`${config.productionUrl}/static/logo/logo-small.png`} alt={config.name} style={{ margin: '0 auto', height: '30px', ...style }} />
  </Section>
);
