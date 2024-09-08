import { Column, Img, Row, Section, Text } from 'jsx-email';

import { config } from 'config';
import { i18n } from '../../backend/src/lib/i18n';

import { AppLogo } from './components/app-logo';
import { EmailContainer } from './components/container';
import { EmailButton } from './components/email-button';
import { EmailHeader } from './components/email-header';
import { EmailReplyTo } from './components/email-reply-to';
import { Footer } from './components/footer';
import Logo from './components/logo';
import UserName from './components/user-name';
import type { BasicTemplateType } from './types';

interface Props extends BasicTemplateType {
  token: string;
  inviteBy: string;
  inviterEmail: string;
}

const productionUrl = config.productionUrl;

export const InviteSystemEmail = ({ userName, userLanguage, userThumbnailUrl, inviteBy, inviterEmail, token }: Props) => {
  const userLogo = userThumbnailUrl || `${productionUrl}/static/email/user.png`;

  return (
    <EmailContainer
      previewText={i18n.t('backend:email.invite_preview_text', { appName: config.name, lng: userLanguage })}
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
              __html: i18n.t('backend:email.invite_title', { lng: userLanguage }),
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
        <UserName userName={userName}>
          <Text>{i18n.t('backend:email.hi', { lng: userLanguage })}</Text>
        </UserName>
        <UserName userName={inviteBy}>
          <div
            // biome-ignore lint/security/noDangerouslySetInnerHtml: <explanation>
            dangerouslySetInnerHTML={{
              __html: i18n.t('backend:email.invite_description', { lng: userLanguage, appName: config.name }),
            }}
          />
        </UserName>
        <Row>
          <Column align="right">
            <Logo logoSrc={userLogo} />
          </Column>
          <Column align="center">
            <Img src={`${productionUrl}/static/email/arrow.png`} width="12" height="9" alt="invited to" />
          </Column>
          <Column align="left">
            <AppLogo />
          </Column>
        </Row>
        <EmailButton ButtonText={i18n.t('common:accept', { lng: userLanguage })} href={`${config.frontendUrl}/auth/invite/${token}`} />
        <Text style={{ fontSize: '.75rem', color: '#6a737d', margin: '0.5rem 0 0 0' }}>
          {i18n.t('backend:email.invite_expire', { lng: userLanguage })}
        </Text>
      </Section>

      <EmailReplyTo email={inviterEmail} />
      <Footer />
    </EmailContainer>
  );
};

export default InviteSystemEmail;
