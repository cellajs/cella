import { Body, Button, Column, Container, Head, Heading, Html, Img, Preview, Row, Section, Tailwind, Text } from '@react-email/components';
import * as React from 'react';

import { config } from 'config';
import { getI18n } from 'i18n';

interface Props {
  username?: string;
  userImage?: string;
  orgName?: string;
  orgImage?: string;
  inviteUrl?: string;
  invitedBy?: string | null;
  i18n?: ReturnType<typeof getI18n>;
  type?: 'system' | 'organization';
}

const baseUrl = config.frontendUrl;

export const InviteEmail = ({
  username = 'Unknown name',
  userImage = '../static/user.png',
  orgName = 'Unknown organization',
  orgImage = '../static/org.png',
  inviteUrl = '',
  invitedBy,
  i18n = getI18n('backend'),
  type = 'organization',
}: Props) => {
  return (
    <React.Fragment>
      <Html>
        <Head />
        <Preview>
          {type === 'system'
            ? i18n.t('email.invite__preview_text', {
                defaultValue: 'You have been invited to join Cella',
              })
            : i18n.t('email.invite_in_organization__preview_text', {
                defaultValue: 'You have been invited to join {{orgName}} on Cella',
                orgName,
              })}
        </Preview>
        <Tailwind>
          <Body className="m-auto bg-white font-sans">
            <Container className="mx-auto my-[40px] w-[465px] rounded border border-solid border-[#eaeaea] p-[20px]">
              <Section className="mt-[32px]">
                <Img src={`${baseUrl}/static/logo.png`} height="37" alt="Cella" className="mx-auto my-0" />
              </Section>
              <Heading className="mx-0 my-[30px] p-0 text-center text-[24px] font-normal text-black">
                <div
                  // biome-ignore lint/security/noDangerouslySetInnerHtml: <explanation>
                  dangerouslySetInnerHTML={{
                    __html:
                      type === 'system'
                        ? i18n.t('email.invite__title', {
                            defaultValue: 'You have been invited to join <strong>Cella</strong>',
                          })
                        : i18n.t('email.invite_to_organization__title', {
                            defaultValue: 'You have been invited to join <strong>{{orgName}}</strong>',
                            orgName: orgName,
                          }),
                  }}
                />
              </Heading>
              <Text className="text-[14px] leading-[24px] text-black">
                <div
                  // biome-ignore lint/security/noDangerouslySetInnerHtml: <explanation>
                  dangerouslySetInnerHTML={{
                    __html:
                      type === 'system'
                        ? i18n.t('email.invite__description', {
                            defaultValue: 'Hi {{username}}, you have been invited to <strong>Cella</strong> by <strong>{{invitedBy}}</strong>',
                            username,
                            invitedBy: invitedBy || 'Unknown inviter',
                          })
                        : i18n.t('email.invite_to_organization__description', {
                            defaultValue:
                              'Hi {{username}}, you have been invited to <strong>{{orgName}}</strong> on <strong>Cella</strong> by <strong>{{invitedBy}}</strong>',
                            username,
                            invitedBy: invitedBy || 'Unknown inviter',
                            orgName,
                          }),
                  }}
                />
              </Text>
              <Section>
                <Row>
                  <Column align="right">
                    <Img className="rounded-full" src={userImage} width="64" height="64" />
                  </Column>
                  <Column align="center">
                    <Img src="../static/arrow.png" width="12" height="9" alt="invited to" />
                  </Column>
                  <Column align="left">
                    {type === 'system' ? (
                      <Img src={`${baseUrl}/static/logo.png`} height="37" alt="Cella" className="mx-auto my-0" />
                    ) : (
                      <Img className="rounded-full" src={orgImage} width="64" height="64" />
                    )}
                  </Column>
                </Row>
              </Section>
              <Section className="my-[32px] text-center">
                <Button className="rounded bg-[#000000] px-5 py-3 text-center text-[12px] font-semibold text-white no-underline" href={inviteUrl}>
                  {i18n.t('email.action__accept', {
                    defaultValue: 'Accept',
                  })}
                </Button>
              </Section>
            </Container>
          </Body>
        </Tailwind>
      </Html>
    </React.Fragment>
  );
};

export default InviteEmail;
