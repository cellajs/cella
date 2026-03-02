import { Column, Row } from 'jsx-email';
import { appConfig } from 'shared';
import { Avatar, EmailBody, EmailButton, EmailContainer, EmailHeader, EmailLogo, Footer, Text } from '../components';
import i18n from '../i18n';
import { avatarRowStyle, greetingStyle } from '../styles';
import type { BasicTemplateType } from '../types';

interface SystemInviteEmailProps extends BasicTemplateType {
  inviteLink: string;
  senderName: string;
}

const appName = appConfig.name;

/**
 * Email template for new users that receive a system-level invitation.
 */
export const SystemInviteEmail = ({ name, lng, senderName, inviteLink }: SystemInviteEmailProps) => {
  return (
    <EmailContainer previewText={i18n.t('backend:email.system_invite.preview', { appName, lng })}>
      {senderName && (
        <Row style={avatarRowStyle}>
          <Column align="center">
            <Avatar name={senderName} type="user" />
          </Column>
        </Row>
      )}

      <EmailHeader
        headerText={
          <div dangerouslySetInnerHTML={{ __html: i18n.t('backend:email.system_invite.title', { appName, lng }) }} />
        }
      />
      <EmailBody>
        {name && <Text style={greetingStyle}>{i18n.t('backend:email.hi', { lng, name })}</Text>}
        <Text>
          <span
            dangerouslySetInnerHTML={{
              __html: i18n.t('backend:email.system_invite.text', { lng, appName, senderName }),
            }}
          />{' '}
          {i18n.t('backend:email.invite_expires', { lng })}
        </Text>

        <EmailButton ButtonText={i18n.t('common:join', { lng })} href={inviteLink} />
      </EmailBody>

      <EmailLogo />
      <Footer />
    </EmailContainer>
  );
};

// Template export
export const Template = SystemInviteEmail;

// Preview props for jsx-email CLI
export const previewProps = {
  lng: 'en',
  subject: 'You are invited',
  name: 'Emily',
  senderName: 'John',
  inviteLink: 'https://cellajs.com/auth/invite?token=preview-token',
} satisfies SystemInviteEmailProps;
