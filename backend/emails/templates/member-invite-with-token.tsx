import { Column, Row } from 'jsx-email';
import { appConfig, type EntityRole } from 'shared';
import { Avatar, EmailBody, EmailButton, EmailContainer, EmailHeader, EmailLogo, Footer, Text } from '../components';
import i18n from '../i18n';
import { avatarRowStyle, greetingStyle } from '../styles';
import type { BasicTemplateType } from '../types';

interface MemberInviteWithTokenEmailProps extends BasicTemplateType {
  inviteLink: string;
  senderName: string;
  entityName: string;
  role: EntityRole;
}

const appName = appConfig.name;

/**
 * Email template for new users that receive a new membership invitation with a token.
 */
export const MemberInviteWithTokenEmail = ({
  name,
  lng,
  senderName,
  role,
  entityName,
  inviteLink,
}: MemberInviteWithTokenEmailProps) => {
  return (
    <EmailContainer previewText={i18n.t('backend:email.member_invite.preview', { lng, entityName, appName })}>
      {senderName && (
        <Row style={avatarRowStyle}>
          <Column align="center">
            <Avatar name={senderName} type="user" />
          </Column>
        </Row>
      )}

      <EmailHeader
        headerText={
          <div dangerouslySetInnerHTML={{ __html: i18n.t('backend:email.member_invite.title', { lng, entityName }) }} />
        }
      />
      <EmailBody>
        {name && <Text style={greetingStyle}>{i18n.t('backend:email.hi', { lng, name })}</Text>}
        <Text>
          <span
            dangerouslySetInnerHTML={{
              __html: i18n.t('backend:email.member_invite.text', { lng, entityName, appName, senderName, role }),
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
export const Template = MemberInviteWithTokenEmail;

// Preview props for jsx-email CLI
export const previewProps = {
  lng: 'en',
  subject: 'You are invited to Acme',
  name: 'Emily',
  senderName: 'John',
  entityName: 'Acme',
  inviteLink: 'https://cellajs.com/auth/invite?token=preview-token',
  role: 'member',
} satisfies MemberInviteWithTokenEmailProps;
