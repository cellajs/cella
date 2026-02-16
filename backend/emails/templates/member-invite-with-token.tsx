import i18n from 'i18next';
import { Column, Row, Text } from 'jsx-email';
import { appConfig, type EntityRole } from 'shared';
import { Avatar, EmailBody, EmailButton, EmailContainer, EmailHeader, EmailLogo, Footer } from '../components';
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

        <EmailButton ButtonText={i18n.t('common:join', { lng })} href={inviteLink} />

        <Text style={{ fontSize: '.85rem', color: '#6a737d', margin: '0.5rem 0 0 0', textAlign: 'center' }}>
          {i18n.t('backend:email.invite_expires', { lng })}
        </Text>
      </EmailBody>

      <EmailLogo />
      <Footer />
    </EmailContainer>
  );
};

// Template export
export const Template = MemberInviteWithTokenEmail;
