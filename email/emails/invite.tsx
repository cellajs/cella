import { Column, Heading, Img, Row, Section, Text } from '@react-email/components';

import { config } from 'config';
import type { i18n } from '../../backend/src/lib/i18n';

import { Logo } from './components/logo';
import { Footer } from './components/footer';
import { EmailButton } from './components/email-button';
import { EmailContainer } from './components/container';

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
  userImage = `${productionUrl}/static/email/user.png`,
  orgName,
  orgImage = `${productionUrl}/static/email/org.png`,
  inviteUrl = baseUrl,
  invitedBy,
  type = 'organization',
  replyTo = config.notificationsEmail,
}: Props) => {
  username = username || i18n.t('common:unknown_name');
  orgName = orgName || i18n.t('common:unknown_organization');

  return (
    <EmailContainer
      previewText={
        type === 'system' ? i18n.t('backend:email.invite_preview_text') : i18n.t('backend:email.invite_in_organization_preview_text', { orgName })
      }
      bodyClassName="m-auto"
      containerClassName="mx-auto my-[40px] w-[465px] rounded border border-solid border-[#eaeaea] p-[20px]"
    >
      <Logo />
      <Heading className="mx-0 my-[30px] p-0 text-center text-[24px] font-normal text-black">
        <div
          // biome-ignore lint/security/noDangerouslySetInnerHtml: <explanation>
          dangerouslySetInnerHTML={{
            __html:
              type === 'system' ? i18n.t('backend:email.invite_title') : i18n.t('backend:email.invite_to_organization_title', { orgName: orgName }),
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
      <Text className="text-[12px] leading-[18px] text-[#6a737d] mt-[20px] gap-1">
        {i18n.t('backend:email.invite_reply_to')}
        <a className="ml-1" href={`mailto:${config.ownerEmail}`}>
          {config.ownerEmail}
        </a>
        {' or '}
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
            <Img src={`${productionUrl}/static/email/arrow.png`} width="12" height="9" alt="invited to" />
          </Column>
          <Column align="left">
            {type === 'system' ? (
              <Img src={`${productionUrl}/static/email/logo.png`} height="37" alt={config.name} className="mx-auto my-0" />
            ) : (
              <Img className="rounded-full" src={orgImage} width="64" height="64" />
            )}
          </Column>
        </Row>
      </Section>
      <EmailButton ButtonText={i18n.t('common:accept')} href={inviteUrl} />
      <Footer />
    </EmailContainer>
  );
};

export default InviteEmail;
