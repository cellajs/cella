import { Img, Section } from 'jsx-email';

import { config } from 'config';

export const AppLogo = () => (
  <Section style={{ marginTop: '2rem' }}>
    <Img src={`${config.productionUrl}/static/email/logo.png`} height="37" alt={config.name} style={{ margin: '0 auto' }} />
  </Section>
);
