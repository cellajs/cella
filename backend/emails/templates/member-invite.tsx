import { type allEntityRoles, appConfig } from 'config';
import i18n from 'i18next';
import { Column, Row, Text } from 'jsx-email';
import { Avatar, EmailBody, EmailButton, EmailContainer, EmailHeader, EmailLogo, Footer } from '../components';
import type { BasicTemplateType } from '../types';

interface MemberInviteEmailProps extends BasicTemplateType {
  memberInviteLink: string;
  senderName: string;
  entityName: string;
  role: (typeof allEntityRoles)[number];
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
        <Row style={{ margin: '1.5rem 0 1rem' }}>
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
        <Text>
          <p style={{ marginBottom: '4px' }}>{name && i18n.t('backend:email.hi', { lng, name })}</p>
          <span
            dangerouslySetInnerHTML={{
              __html: i18n.t('backend:email.member_invite.text', { lng, entityName, appName, senderName, role }),
            }}
          />
        </Text>

        <EmailButton ButtonText={i18n.t('common:accept', { lng })} href={memberInviteLink} />
      </EmailBody>

      <EmailLogo />
      <Footer />
    </EmailContainer>
  );
};

// Template export
export const Template = MemberInviteEmail;
