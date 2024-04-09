import { Body, Button, Column, Container, Head, Heading, Hr, Html, Img, Preview, Row, Section, Tailwind, Text } from '@react-email/components';
import * as React from 'react';

import { config } from 'config';
import type { i18n } from '../../backend/src/lib/i18n';

interface Props {
  i18n: typeof i18n;
  username?: string;
  userImage?: string;
  orgName?: string;
  orgImage?: string;
  inviteUrl?: string;
  invitedBy?: string | null;
  type?: 'system' | 'organization';
  replyTo?: string;
}

const baseUrl = config.frontendUrl;
const productionUrl = config.productionUrl;

export const InviteEmail = ({
  i18n,
  username,
  userImage = `${productionUrl}/static/user.png`,
  orgName,
  orgImage = `${productionUrl}/static/org.png`,
  inviteUrl = baseUrl,
  invitedBy,
  type = 'organization',
  replyTo = config.notificationsEmail,
}: Props) => {
  username = username || i18n.t('common:unknown_name');
  orgName = orgName || i18n.t('common:unknown_organization');

  return (
    <React.Fragment>
      <Html>
        <Head />
        <Preview>
          {type === 'system' ? i18n.t('backend:email.invite_preview_text') : i18n.t('backend:email.invite_in_organization_preview_text', { orgName })}
        </Preview>
        <Tailwind>
          <Body className="m-auto bg-white font-sans">
            <Container className="mx-auto my-[40px] w-[465px] rounded border border-solid border-[#eaeaea] p-[20px]">
              <Section className="mt-[32px]">
                <Img src={`${productionUrl}/static/logo/logo.png`} height="37" alt={config.name} className="mx-auto my-0" />
              </Section>
              <Heading className="mx-0 my-[30px] p-0 text-center text-[24px] font-normal text-black">
                <div
                  // biome-ignore lint/security/noDangerouslySetInnerHtml: <explanation>
                  dangerouslySetInnerHTML={{
                    __html:
                      type === 'system'
                        ? i18n.t('backend:email.invite_title')
                        : i18n.t('backend:email.invite_to_organization_title', { orgName: orgName }),
                  }}
                />
              </Heading>
              <Text className="text-[14px] leading-[24px] text-black">
                <div
                  // biome-ignore lint/security/noDangerouslySetInnerHtml: <explanation>
                  dangerouslySetInnerHTML={{
                    __html:
                      type === 'system'
                        ? i18n.t('backend:email.invite_description', { username, invitedBy: invitedBy || i18n.t('common:unknown_inviter') })
                        : i18n.t('backend:email.invite_to_organization_description', {
                            username,
                            invitedBy: invitedBy || i18n.t('common:unknown_inviter'),
                            orgName,
                          }),
                  }}
                />
              </Text>
              <Text className="text-[12px] leading-[18px] text-[#6a737d] mt-[20px]">
                {i18n.t('backend:email.invite_reply_to')}
                <a className="ml-1" href={`mailto:${replyTo}`}>
                  {replyTo}
                </a>
              </Text>
              <Text className="text-[12px] leading-[18px] text-[#6a737d] mt-[20px]">{i18n.t('backend:email.invite_expire')}</Text>
              <Section className="mt-[50px]">
                <Row>
                  <Column align="right">
                    <Img className="rounded-full" src={userImage} width="64" height="64" />
                  </Column>
                  <Column align="center">
                    <Img src={`${productionUrl}/static/arrow.png`} width="12" height="9" alt="invited to" />
                  </Column>
                  <Column align="left">
                    {type === 'system' ? (
                      <Img src={`${productionUrl}/static/logo/logo.png`} height="37" alt={config.name} className="mx-auto my-0" />
                    ) : (
                      <Img className="rounded-full" src={orgImage} width="64" height="64" />
                    )}
                  </Column>
                </Row>
              </Section>
              <Section className="my-[32px] text-center">
                <Button className="rounded bg-[#000000] px-5 py-3 text-center text-[12px] font-semibold text-white no-underline" href={inviteUrl}>
                  {i18n.t('common:accept')}
                </Button>
              </Section>
              <Hr />
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

export default InviteEmail;
