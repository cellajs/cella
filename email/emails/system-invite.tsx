import { Column, Img, Row, Section, Text } from '@react-email/components';

import { config } from 'config';
import { i18n } from '../../backend/src/lib/i18n';

import type { UserModel } from '../../backend/src/db/schema/users';
import { EmailContainer } from './components/container';
import { EmailButton } from './components/email-button';
import { EmailHeader } from './components/email-header';
import { EmailReplyTo } from './components/email-reply-to';
import { Footer } from './components/footer';

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
      containerClassName="mx-auto my-10 w-[465px] rounded border border-solid border-[#eaeaea] p-5"
    >
      <EmailHeader headerText={i18nInstance.t('backend:email.invite_title')} />
      <Text className="text-sm leading-6 text-black">
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
      <Section className="mt-12">
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
