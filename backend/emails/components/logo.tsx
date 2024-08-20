import { Img, Section } from 'jsx-email';

import { config } from 'config';

export const Logo = () => (
  <Section className="mt-[2rem]">
    <Img src={`${config.productionUrl}/static/email/logo.png`} height="37" alt={config.name} className="mx-auto my-0" />
  </Section>
);
