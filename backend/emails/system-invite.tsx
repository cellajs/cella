import { Column, Row, Section, Text } from 'jsx-email';

import { config } from 'config';
import { i18n } from '../../backend/src/lib/i18n';

import { AppLogo } from './components/app-logo';
import { ArrowRight } from './components/arrow-right';
import Avatar from './components/avatar';
import { EmailContainer } from './components/container';
import { EmailButton } from './components/email-button';
import { EmailHeader } from './components/email-header';
import { EmailReplyTo } from './components/email-reply-to';
import { Footer } from './components/footer';
import UserName from './components/user-name';
import type { BasicTemplateType } from './types';

interface Props extends BasicTemplateType {
  token: string;
  inviteBy: string;
  inviterEmail: string;
}

const appName = config.name;

export const InviteSystemEmail = ({ userName, userLanguage: lng, inviteBy, inviterEmail, token }: Props) => {
  return (
    <EmailContainer
      previewText={i18n.t('backend:email.invite_preview_text', { appName, lng })}
      containerStyle={{
        marginTop: '2.5rem',
        marginBottom: '2.5rem',
        width: '50rem',
      }}
    >
      <EmailHeader
        headerText={
          <div
            // biome-ignore lint/security/noDangerouslySetInnerHtml: <explanation>
            dangerouslySetInnerHTML={{
              __html: i18n.t('backend:email.invite_title', { appName, lng }),
            }}
          />
        }
      />
      <Section
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          borderRadius: '.75rem',
          borderWidth: '1px',
          borderStyle: 'solid',
          borderColor: '#eaeaea',
          padding: '1rem',
        }}
      >
        <UserName beforeText={i18n.t('backend:email.hi', { lng })} userName={userName} />
        <UserName beforeText={i18n.t('backend:email.invite_description', { lng, appName })} userName={inviteBy} />

        <Row>
          <Column align="right">
            <Avatar name={userName} type="user" />
          </Column>
          <Column align="center">
            <ArrowRight />
          </Column>
          <Column align="left">
            <AppLogo />
          </Column>
        </Row>
        <EmailButton ButtonText={i18n.t('common:accept', { lng })} href={`${config.frontendUrl}/auth/invite/${token}`} />
        <Text style={{ fontSize: '.75rem', color: '#6a737d', margin: '0.5rem 0 0 0' }}>{i18n.t('backend:email.invite_expire', { lng })}</Text>
      </Section>

      <EmailReplyTo email={inviterEmail} />
      <Footer />
    </EmailContainer>
  );
};

export default InviteSystemEmail;
