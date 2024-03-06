import { Body, Button, Container, Head, Html, Img, Link, Preview, Section, Tailwind, Text } from '@react-email/components';
import * as React from 'react';

import { config } from 'config';
import { i18n } from '../../backend/src/lib/i18n';

interface Props {
  username?: string;
  resetPasswordLink: string;
}

const baseUrl = config.frontendUrl;
const resetPasswordUrl = `${baseUrl}/auth/reset-password`;

export const ResetPasswordEmail = ({ username = i18n.t('common:unknown_name'), resetPasswordLink = baseUrl }: Props) => {
  return (
    <React.Fragment>
      <Html>
        <Head />
        <Preview>
          {i18n.t('backend:email.reset_password_preview_text')}
        </Preview>
        <Tailwind>
          <Body className="bg-white py-2.5 font-sans">
            <Container className="border-[#f0f0f0] p-[45px] font-light text-[#404040] leading-[26px]">
              <Section className="mt-[32px]">
                <Img src={`${baseUrl}/static/logo.png`} height="37" alt={config.name} className="mx-auto my-0" />
              </Section>
              <Section>
                <Text>
                  {i18n.t('backend:email.hi')}{' '}
                  {username},
                </Text>
                <Text>
                  {i18n.t('backend:email.reset_password_text_1')}
                </Text>
                <Button
                  className="rounded bg-[#000000] px-5 py-3 text-center text-[12px] font-semibold text-white no-underline"
                  href={resetPasswordLink}
                >
                  {i18n.t('common:reset_password')}
                </Button>
                <Text>
                  {i18n.t('backend:email.reset_password_text_2')}{' '}
                  <Link href={resetPasswordUrl}>{resetPasswordUrl}</Link>
                </Text>
                <Text>
                  {i18n.t('backend:email.reset_password_text_3')}
                </Text>
              </Section>
            </Container>
          </Body>
        </Tailwind>
      </Html>
    </React.Fragment>
  );
};

export default ResetPasswordEmail;
