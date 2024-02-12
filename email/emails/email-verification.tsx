import { Body, Button, Container, Head, Html, Img, Preview, Section, Tailwind, Text } from '@react-email/components';
import * as React from 'react';

import { config } from 'config';
import { i18n } from '../../backend/src/lib/i18n';

interface Props {
  verificationLink: string;
}

const baseUrl = config.frontendUrl;

export const VerificationEmail = ({ verificationLink = 'https://cellajs.com' }: Props) => {
  return (
    <React.Fragment>
      <Html>
        <Head />
        <Preview>{i18n.t('backend:email.verification_preview_text')}</Preview>
        <Tailwind>
          <Body className="bg-white py-2.5 font-sans">
            <Container className="border-[#f0f0f0] p-[45px] font-light text-[#404040] leading-[26px]">
              <Section className="mt-[32px]">
                <Img src={`${baseUrl}/static/logo.png`} height="37" alt="Cella" className="mx-auto my-0" />
              </Section>
              <Section>
                <Text>
                  {i18n.t('email.verification_text_1', {
                    defaultValue:
                      'Hi, you are almost ready to start on Cella! Click the link below to verify your email address and get started. The link expires in 2 hours.',
                  })}
                </Text>
                <Section className="text-center">
                  <Button
                    className="rounded bg-[#000000] px-5 py-3 text-center text-[12px] font-semibold text-white no-underline"
                    href={verificationLink}
                  >
                    {i18n.t('action.verify_email', {
                      defaultValue: 'Verify my email address',
                    })}
                  </Button>
                </Section>
              </Section>
            </Container>
          </Body>
        </Tailwind>
      </Html>
    </React.Fragment>
  );
};

export default VerificationEmail;
