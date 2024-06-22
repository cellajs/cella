import { Column, Img, Row, Section, Text } from '@react-email/components';

import { config } from 'config';
import { i18n } from '../../backend/src/lib/i18n';

import { EmailContainer } from './components/container';
import { EmailButton } from './components/email-button';
import { Footer } from './components/footer';
import type { UserModel } from '../../backend/src/db/schema/users';
import type { OrganizationModel } from '../../backend/src/db/schema/organizations';
import { EmailHeader } from './components/email-header';
import { EmailReplyTo } from './components/email-reply-to';

interface Props {
  organization: OrganizationModel;
  targetUser?: Omit<UserModel, 'hashedPassword'>;
  user: Omit<UserModel, 'hashedPassword'>;
  token: string;
}

const productionUrl = config.productionUrl;

export const InviteMemberEmail = ({ organization, user, targetUser, token }: Props) => {
  const emailLanguage = organization?.defaultLanguage || targetUser?.language || config.defaultLanguage;
  const i18nInstance = i18n.cloneInstance({ lng: i18n.languages.includes(emailLanguage) ? emailLanguage : config.defaultLanguage });
  const username = targetUser?.name || targetUser?.email || i18nInstance.t('common:unknown_name');
  const orgName = organization?.name || i18nInstance.t('common:unknown_organization');
  const orgLogo = organization?.logoUrl || organization?.thumbnailUrl || `${productionUrl}/static/email/org.png`;
  const userLogo = targetUser?.thumbnailUrl ? targetUser?.thumbnailUrl : `${productionUrl}/static/email/user.png`;

  return (
    <EmailContainer
      previewText={i18nInstance.t('backend:email.invite_in_organization_preview_text', { orgName })}
      bodyClassName="m-auto"
      containerClassName="mx-auto my-[40px] w-[465px] rounded border border-solid border-[#eaeaea] p-[20px]"
    >
      <EmailHeader headerText={i18nInstance.t('backend:email.invite_to_organization_title', { orgName: orgName })} />
      <Text className="text-[14px] leading-[24px] text-black">
        <div
          // biome-ignore lint/security/noDangerouslySetInnerHtml: <explanation>
          dangerouslySetInnerHTML={{
            __html: i18nInstance.t('backend:email.invite_to_organization_description', {
              username,
              invitedBy: user.name || i18nInstance.t('common:unknown_inviter'),
              orgName,
            }),
          }}
        />
      </Text>
      <EmailReplyTo email={user.email} />
      <Section className="mt-[50px]">
        <Row>
          <Column align="right">
            <Img className="rounded-full" src={userLogo} width="64" height="64" />
          </Column>
          <Column align="center">
            <Img src={`${productionUrl}/static/email/arrow.png`} width="12" height="9" alt="invited to" />
          </Column>
          <Column align="left">
            <Img className="rounded-full" src={orgLogo} width="64" height="64" />
          </Column>
        </Row>
      </Section>
      <EmailButton ButtonText={i18nInstance.t('common:accept')} href={`${config.frontendUrl}/auth/invite/${token}`} />
      <Footer />
    </EmailContainer>
  );
};

export default InviteMemberEmail;
