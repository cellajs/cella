import { Body, Button, Container, Head, Hr, Html, Img, Preview, Section, Tailwind, Text } from '@react-email/components';
import * as React from 'react';

import { config } from 'config';
import { i18n } from '../../backend/src/lib/i18n';

interface Props {
  i18n: typeof i18n;
  verificationLink: string;
}

const baseUrl = config.frontendUrl;
const productionUrl = config.productionUrl;

export const VerificationEmail = ({ i18n, verificationLink = baseUrl }: Props) => {
  return (
    <React.Fragment>
      <Html>
        <Head />
        <Preview>{i18n.t('backend:email.please_verify_email')}</Preview>
        <Tailwind>
          <Body className="bg-white py-2.5 font-sans">
            <Container className="border-[#f0f0f0] p-[45px] font-light text-[#404040] leading-[26px]">
              <Section className="mt-[32px]">
                <Img src={`${productionUrl}/static/logo.png`} height="37" alt={config.name} className="mx-auto my-0" />
              </Section>
              <Section>
                <Text>{i18n.t('backend:email.verification_text_1')}</Text>
                <Section className="text-center mt-[32px]">
                  <Button
                    className="rounded bg-[#000000] px-5 py-3 text-center text-[12px] font-semibold text-white no-underline"
                    href={verificationLink}
                  >
                    {i18n.t('common:verify_my_email')}
                  </Button>
                </Section>
              </Section>
              <Hr className="mt-[24px]" />
              <Section className="text-[#6a737d]">
                <Text className="text-[12px] leading-[18px]">
                  {config.name}
                  <br />
                  {config.company.streetAddress}
                  <br />
                  {config.company.city}
                  <br />
                  {config.company.country}, {config.company.postcode}
                </Text>
              </Section>
            </Container>
          </Body>
        </Tailwind>
      </Html>
    </React.Fragment>
  );
};

export default VerificationEmail;
