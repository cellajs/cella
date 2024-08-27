import { Column, Img, Row, Section, Text } from 'jsx-email';

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
      containerStyle={{
        marginTop: '2.5rem',
        marginBottom: '2.5rem',
        width: '32rem',
      }}
    >
      <EmailHeader
        headerText={
          <div
            // biome-ignore lint/security/noDangerouslySetInnerHtml: <explanation>
            dangerouslySetInnerHTML={{
              __html: i18nInstance.t('backend:email.invite_title'),
            }}
          />
        }
      />
      <Section
        style={{
          borderRadius: '0.25rem',
          borderWidth: '1px',
          borderStyle: 'solid',
          borderColor: '#eaeaea',
          padding: '1rem',
        }}
      >
        <Text
          style={{
            fontSize: '1rem',
            lineHeight: '1.5',
            color: '#000000',
          }}
        >
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
        <Row>
          <Column align="right">
            <Img
              style={{
                borderRadius: '9999px',
                margin: '0 0 0 5.625rem',
              }}
              src={userLogo}
              width="64"
              height="64"
            />
          </Column>
          <Column align="center">
            <Img src={`${productionUrl}/static/email/arrow.png`} width="12" height="9" alt="invited to" />
          </Column>
          <Column align="left">
            <Img
              src={`${productionUrl}/static/email/logo.png`}
              height="37"
              alt={config.name}
              style={{
                margin: '0 5.625rem 0 0',
              }}
            />
          </Column>
        </Row>
        <EmailButton ButtonText={i18n.t('common:accept')} href={`${config.frontendUrl}/auth/invite/${token}`} />
        <Text style={{ fontSize: '.75rem', color: '#6a737d', margin: '0.5rem 0 0 0' }}>{i18n.t('backend:email.invite_expire')}</Text>
      </Section>

      <EmailReplyTo email={user.email} />
      <Footer />
    </EmailContainer>
  );
};

export default InviteSystemEmail;
