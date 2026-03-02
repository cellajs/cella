import { Column, Row } from 'jsx-email';
import { appConfig, type EntityRole } from 'shared';
import { Avatar, EmailBody, EmailButton, EmailContainer, EmailHeader, EmailLogo, Footer, Text } from '../components';
import i18n from '../i18n';
import { avatarRowStyle, greetingStyle } from '../styles';
import type { BasicTemplateType } from '../types';

interface MemberAddedEmailProps extends BasicTemplateType {
  entityLink: string;
  senderName: string;
  entityName: string;
  role: EntityRole;
}

const appName = appConfig.name;

/**
 * Email template for users directly added to an entity (Scenario 2b).
 * Unlike invite emails, no action is required - the user is already a member.
 */
export const MemberAddedEmail = ({ name, lng, senderName, role, entityName, entityLink }: MemberAddedEmailProps) => {
  return (
    <EmailContainer previewText={i18n.t('backend:email.member_added.preview', { lng, entityName, appName })}>
      {senderName && (
        <Row style={avatarRowStyle}>
          <Column align="center">
            <Avatar name={senderName} type="user" />
          </Column>
        </Row>
      )}

      <EmailHeader
        headerText={
          <div dangerouslySetInnerHTML={{ __html: i18n.t('backend:email.member_added.title', { lng, entityName }) }} />
        }
      />
      <EmailBody>
        {name && <Text style={greetingStyle}>{i18n.t('backend:email.hi', { lng, name })}</Text>}
        <Text>
          <span
            dangerouslySetInnerHTML={{
              __html: i18n.t('backend:email.member_added.text', { lng, entityName, appName, senderName, role }),
            }}
          />
        </Text>

        <EmailButton ButtonText={i18n.t('common:view', { lng })} href={entityLink} />
      </EmailBody>

      <EmailLogo />
      <Footer />
    </EmailContainer>
  );
};

// Template export
export const Template = MemberAddedEmail;

// Preview props for jsx-email CLI
export const previewProps = {
  lng: 'en',
  subject: 'You were added to Acme',
  name: 'Emily',
  senderName: 'John',
  entityName: 'Acme',
  entityLink: 'https://cellajs.com/acme',
  role: 'member',
} satisfies MemberAddedEmailProps;
