import { config } from 'config';
import i18n from 'i18next';
import { Column, Row, Text } from 'jsx-email';
import type { BasicTemplateType } from '../src/lib/mailer';
import { AppLogo } from './components/app-logo';
import { Avatar } from './components/avatar';
import { EmailContainer } from './components/container';
import { EmailBody } from './components/email-body';
import { EmailButton } from './components/email-button';
import { EmailHeader } from './components/email-header';
import { Footer } from './components/footer';

export interface SystemInviteEmailProps extends BasicTemplateType {
  systemInviteLink: string;
  senderName: string;
}

const appName = config.name;

export const SystemInviteEmail = ({ name, lng, senderName, systemInviteLink }: SystemInviteEmailProps) => {
  return (
    <EmailContainer previewText={i18n.t('backend:email.system_invite.preview', { appName, lng })}>
      {senderName && (
        <Row style={{ margin: '1.5rem 0 1rem' }}>
          <Column align="center">
            <Avatar name={senderName} type="user" />
          </Column>
        </Row>
      )}

      <EmailHeader
        headerText={
          <div
            // biome-ignore lint/security/noDangerouslySetInnerHtml: <explanation>
            dangerouslySetInnerHTML={{
              __html: i18n.t('backend:email.system_invite.title', { appName, lng }),
            }}
          />
        }
      />
      <EmailBody>
        <Text>
          <p style={{ marginBottom: '4px' }}>{name && i18n.t('backend:email.hi', { lng, name })}</p>
          <span
            // biome-ignore lint/security/noDangerouslySetInnerHtml: <explanation>
            dangerouslySetInnerHTML={{
              __html: i18n.t('backend:email.system_invite.text', { lng, appName, senderName }),
            }}
          />
        </Text>

        {/* User is sent to authenticate page, where this invitation token will be used to complete the sign up process */}
        <EmailButton ButtonText={i18n.t('common:join', { lng })} href={systemInviteLink} />

        <Text style={{ fontSize: '.85rem', margin: '0.5rem 0 0 0', textAlign: 'center' }}>{i18n.t('backend:email.invite_expires', { lng })}</Text>
      </EmailBody>

      <AppLogo />
      <Footer />
    </EmailContainer>
  );
};

// Template export
export const Template = SystemInviteEmail;
