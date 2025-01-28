import { config } from 'config';
import { Column, Row, Text } from 'jsx-email';
import { i18n } from '../src/lib/i18n';
import { AppLogo } from './components/app-logo';
import { Avatar } from './components/avatar';
import { EmailContainer } from './components/container';
import { EmailBody } from './components/email-body';
import { EmailButton } from './components/email-button';
import { EmailHeader } from './components/email-header';
import { Footer } from './components/footer';
import type { BasicTemplateType } from './types';

interface Props extends BasicTemplateType {
  systemInviteLink: string;
  inviteBy: string;
}

const appName = config.name;

export const SystemInviteEmail = ({ userName, userLanguage: lng, inviteBy, systemInviteLink }: Props) => {
  return (
    <EmailContainer previewText={i18n.t('backend:email.system_invite.preview', { appName, lng })}>
      {inviteBy && (
        <Row style={{ margin: '1.5rem 0 1rem' }}>
          <Column align="center">
            <Avatar name={inviteBy} type="user" />
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
        <p style={{ marginBottom: '4px' }}>{userName && i18n.t('backend:email.hi', { lng, userName })}</p>
        <Text>
          <span
            // biome-ignore lint/security/noDangerouslySetInnerHtml: <explanation>
            dangerouslySetInnerHTML={{
              __html: i18n.t('backend:email.system_invite.text', { lng, appName, inviteBy }),
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
