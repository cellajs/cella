import { Body, Button, Container, Head, Html, Img, Link, Preview, Section, Tailwind, Text } from '@react-email/components';

import { config } from 'config';
import { getI18n } from 'i18n';

interface Props {
  username?: string;
  resetPasswordLink: string;
  i18n?: ReturnType<typeof getI18n>;
}

const baseUrl = config.frontendUrl;
const resetPasswordUrl = `${baseUrl}/auth/reset-password`;

export const ResetPasswordEmail = ({ username = 'Unknown name', resetPasswordLink = 'https://cellajs.com', i18n = getI18n('backend') }: Props) => {
  return (
    <Html>
      <Head />
      <Preview>
        {i18n.t('email.reset_password__preview_text', {
          defaultValue: 'Reset your Cella password',
        })}
      </Preview>
      <Tailwind>
        <Body className="bg-white py-2.5 font-sans">
          <Container className="border-[#f0f0f0] p-[45px] font-light text-[#404040] leading-[26px]">
            <Section className="mt-[32px]">
              <Img src={`${baseUrl}/static/logo.png`} height="37" alt="Cella" className="mx-auto my-0" />
            </Section>
            <Section>
              <Text>
                {i18n.t('action.hi', {
                  defaultValue: 'Hi',
                })}{' '}
                {username},
              </Text>
              <Text>
                {i18n.t('email.reset_password_text_1', {
                  defaultValue: 'A password reset link has been requested for your Cella account. If this was you, you can set a new password here:',
                })}
              </Text>
              <Button
                className="rounded bg-[#000000] px-5 py-3 text-center text-[12px] font-semibold text-white no-underline"
                href={resetPasswordLink}
              >
                {i18n.t('action.reset_password', {
                  defaultValue: 'Reset password',
                })}
              </Button>
              <Text>
                {i18n.t('email.reset_password_text_2', {
                  defaultValue: 'This link will expire in 3 hours. To get a new password reset link, visit:',
                })}{' '}
                <Link href={resetPasswordUrl}>{resetPasswordUrl}</Link>
              </Text>
              <Text>
                {i18n.t('email.reset_password_text_3', {
                  defaultValue: "Ignore this email if you don't want to change your password or didn't request it.",
                })}
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};

export default ResetPasswordEmail;
