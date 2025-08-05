import { appConfig } from 'config';
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

export interface MemberInviteEmailProps extends BasicTemplateType {
  memberInviteLink: string;
  senderName: string;
  entityName: string;
  role: (typeof appConfig.rolesByType.entityRoles)[number];
}

const appName = appConfig.name;

export const MemberInviteEmail = ({ name, lng, senderName, role, entityName, memberInviteLink }: MemberInviteEmailProps) => {
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
          <div
            // biome-ignore lint/security/noDangerouslySetInnerHtml: trusted HTML content from a secure source
            dangerouslySetInnerHTML={{
              __html: i18n.t('backend:email.member_invite.title', { lng, entityName }),
            }}
          />
        }
      />
      <EmailBody>
        <Text>
          <p style={{ marginBottom: '4px' }}>{name && i18n.t('backend:email.hi', { lng, name })}</p>
          <span
            // biome-ignore lint/security/noDangerouslySetInnerHtml: trusted HTML content from a secure source
            dangerouslySetInnerHTML={{
              __html: i18n.t('backend:email.member_invite.text', { lng, entityName, appName, senderName, role }),
            }}
          />
        </Text>
        {/* User is sent to org invite page, where this invitation token will be used to accept invitation. If not already signed in, 
        it will either forward user to sign in if user exists, or to sign up if user does not exist. */}
        <EmailButton ButtonText={i18n.t('common:accept', { lng })} href={memberInviteLink} />

        <Text style={{ fontSize: '.85rem', color: '#6a737d', margin: '0.5rem 0 0 0', textAlign: 'center' }}>
          {i18n.t('backend:email.invite_expires', { lng })}
        </Text>
      </EmailBody>

      <AppLogo />
      <Footer />
    </EmailContainer>
  );
};

// Template export
export const Template = MemberInviteEmail;
