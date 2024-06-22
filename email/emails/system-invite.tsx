import { Column, Img, Row, Section, Text } from '@react-email/components';

import { config } from 'config';
import { i18n } from '../../backend/src/lib/i18n';

import { EmailContainer } from './components/container';
import { EmailButton } from './components/email-button';
import { Footer } from './components/footer';
import type { UserModel } from '../../backend/src/db/schema/users';
import { EmailReplyTo } from './components/email-reply-to';
import { EmailHeader } from './components/email-header';

interface Props {
  targetUser?: Omit<UserModel, 'hashedPassword'>;
  user: Omit<UserModel, 'hashedPassword'>;
  token: string;
}

const productionUrl = config.productionUrl;

export const InviteSystemEmail = ({ user, targetUser, token }: Props) => {
  const emailLanguage = targetUser?.language || config.defaultLanguage;
  const i18nInstance = i18n.cloneInstance({ lng: i18n.languages.includes(emailLanguage) ? emailLanguage : config.defaultLanguage });
  const username = targetUser?.name || targetUser?.email || i18nInstance.t('common:unknown_name');
  const userLogo = targetUser?.thumbnailUrl || `${productionUrl}/static/email/user.png`;

  return (
    <EmailContainer
      previewText={i18nInstance.t('backend:email.invite_preview_text')}
      bodyClassName="m-auto"
      containerClassName="mx-auto my-[40px] w-[465px] rounded border border-solid border-[#eaeaea] p-[20px]"
    >
      <EmailHeader headerText={i18nInstance.t('backend:email.invite_title')} />
      <Text className="text-[14px] leading-[24px] text-black">
        <div
          // biome-ignore lint/security/noDangerouslySetInnerHtml: <explanation>
          dangerouslySetInnerHTML={{
            __html: i18nInstance.t('backend:email.invite_description', {
              username,
              invitedBy: user.name || i18nInstance.t('common:unknown_inviter'),
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
            <Img src={`${productionUrl}/static/email/logo.png`} height="37" alt={config.name} className="mx-auto my-0" />
          </Column>
        </Row>
      </Section>
      <EmailButton ButtonText={i18n.t('common:accept')} href={`${config.frontendUrl}/auth/invite/${token}`} />
      <Footer />
    </EmailContainer>
  );
};

export default InviteSystemEmail;
