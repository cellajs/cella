import { Column, Row } from 'jsx-email';
import { appConfig, type EntityRole } from 'shared';
import {
  EmailAvatar,
  EmailBody,
  EmailButton,
  EmailContainer,
  EmailFooter,
  EmailHeader,
  EmailLogo,
  EmailText,
} from '../components';
import i18n from '../i18n';
import { avatarRowStyle, greetingStyle } from '../styles';
import type { BasicTemplateType } from '../types';

interface MemberInviteEmailProps extends BasicTemplateType {
  memberInviteLink: string;
  senderName: string;
  entityName: string;
  role: EntityRole;
}

const appName = appConfig.name;

/**
 * Email template for existing users that receive a new membership invitation.
 */
export const MemberInviteEmail = ({
  name,
  lng,
  senderName,
  role,
  entityName,
  memberInviteLink,
}: MemberInviteEmailProps) => {
  return (
    <EmailContainer previewText={i18n.t('backend:email.member_invite.preview', { lng, entityName, appName })}>
      {senderName && (
        <Row style={avatarRowStyle}>
          <Column align="center">
            <EmailAvatar name={senderName} type="user" />
          </Column>
        </Row>
      )}

      <EmailHeader
        headerText={
          <div dangerouslySetInnerHTML={{ __html: i18n.t('backend:email.member_invite.title', { lng, entityName }) }} />
        }
      />
      <EmailBody>
        {name && <EmailText style={greetingStyle}>{i18n.t('backend:email.hi', { lng, name })}</EmailText>}
        <EmailText>
          <span
            dangerouslySetInnerHTML={{
              __html: i18n.t('backend:email.member_invite.text', { lng, entityName, appName, senderName, role }),
            }}
          />
        </EmailText>

        <EmailButton ButtonText={i18n.t('common:accept', { lng })} href={memberInviteLink} />
      </EmailBody>

      <EmailLogo />
      <EmailFooter />
    </EmailContainer>
  );
};

// Template export
export const Template = MemberInviteEmail;

// Preview props for jsx-email CLI
export const previewProps = {
  lng: 'en',
  subject: 'You are invited to Acme',
  name: 'Emily',
  senderName: 'John',
  entityName: 'Acme',
  memberInviteLink: 'https://cellajs.com/acme/invite',
  role: 'member',
} satisfies MemberInviteEmailProps;
