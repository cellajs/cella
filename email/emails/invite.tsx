import { Column, Heading, Img, Row, Section, Text } from '@react-email/components';

import { config } from 'config';
import { i18n } from '../../backend/src/lib/i18n';

import { EmailContainer } from './components/container';
import { EmailButton } from './components/email-button';
import { Footer } from './components/footer';
import { Logo } from './components/logo';

type Organization = {
  name: string;
  slug: string;
  defaultLanguage: 'en' | 'nl';
  languages: string[];
  id: string;
  entity: 'ORGANIZATION';
  bannerUrl: string | null;
  thumbnailUrl: string | null;
  logoUrl: string | null;
};

type User = {
  id: string;
  entity: 'USER';
  slug: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  language: 'en' | 'nl';
  bannerUrl: string | null;
  thumbnailUrl: string | null;
};

interface Props {
  organization?: Organization;
  targetUser?: User;
  user: User;
  token: string;
  type?: 'system' | 'organization';
}

const productionUrl = config.productionUrl;

export const InviteEmail = ({ organization, user, targetUser, token, type = 'organization' }: Props) => {
  const emailLanguage = organization?.defaultLanguage || targetUser?.language || config.defaultLanguage;
  const i18nInstance = i18n.cloneInstance({ lng: i18n.languages.includes(emailLanguage) ? emailLanguage : config.defaultLanguage });
  const username = targetUser?.name || targetUser?.email || i18nInstance.t('common:unknown_name');
  const orgName = organization?.name || i18nInstance.t('common:unknown_organization');
  const orgLogo = organization?.logoUrl ? organization?.logoUrl : undefined;
  const userLogo = targetUser?.thumbnailUrl ? targetUser?.thumbnailUrl : undefined;
  return (
    <EmailContainer
      previewText={
        type === 'system'
          ? i18nInstance.t('backend:email.invite_preview_text')
          : i18nInstance.t('backend:email.invite_in_organization_preview_text', { orgName })
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
              type === 'system'
                ? i18nInstance.t('backend:email.invite_title')
                : i18nInstance.t('backend:email.invite_to_organization_title', { orgName: orgName }),
          }}
        />
      </Heading>
      <Text className="text-[14px] leading-[24px] text-black">
        <div
          // biome-ignore lint/security/noDangerouslySetInnerHtml: <explanation>
          dangerouslySetInnerHTML={{
            __html:
              type === 'system'
                ? i18nInstance.t('backend:email.invite_description', { username, invitedBy: user.name || i18nInstance.t('common:unknown_inviter') })
                : i18nInstance.t('backend:email.invite_to_organization_description', {
                    username,
                    invitedBy: user.name || i18nInstance.t('common:unknown_inviter'),
                    orgName,
                  }),
          }}
        />
      </Text>
      <Text className="text-[12px] leading-[18px] text-[#6a737d] mt-[20px] gap-1">
        {i18nInstance.t('backend:email.invite_reply_to')}
        <a className="ml-1" href={`mailto:${user.email}`}>
          {user.email}
        </a>
        {' or '}
        <a className="ml-1" href={`mailto:${config.supportEmail}`}>
          {config.supportEmail}
        </a>
      </Text>
      <Text className="text-[12px] leading-[18px] text-[#6a737d] mt-[20px]">{i18n.t('backend:email.invite_expire')}</Text>
      <Section className="mt-[50px]">
        <Row>
          <Column align="right">
            <Img className="rounded-full" src={userLogo} width="64" height="64" />
          </Column>
          <Column align="center">
            <Img src={`${productionUrl}/static/email/arrow.png`} width="12" height="9" alt="invited to" />
          </Column>
          <Column align="left">
            {type === 'system' ? (
              <Img src={`${productionUrl}/static/email/logo.png`} height="37" alt={config.name} className="mx-auto my-0" />
            ) : (
              <Img className="rounded-full" src={orgLogo} width="64" height="64" />
            )}
          </Column>
        </Row>
      </Section>
      <EmailButton ButtonText={i18n.t('common:accept')} href={`${config.frontendUrl}/auth/invite/${token}`} />
      <Footer />
    </EmailContainer>
  );
};

export default InviteEmail;
