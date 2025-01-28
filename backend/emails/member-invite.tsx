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
import { UserName } from './components/user-name';
import type { BasicTemplateType } from './types';

interface Props extends BasicTemplateType {
  token: string;
  inviteBy: string;
  organizationName?: string;
  organizationThumbnailUrl?: string | null;
}

const appName = config.name;

export const MemberInviteEmail = ({ userName, userLanguage: lng, inviteBy, organizationName, token }: Props) => {
  const orgName = organizationName || i18n.t('common:unknown_organization', { lng });

  return (
    <EmailContainer previewText={i18n.t('backend:email.member_invite.preview', { lng, orgName, appName })}>
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
              __html: i18n.t('backend:email.member_invite.title', { lng, orgName }),
            }}
          />
        }
      />
      <EmailBody>
        {userName && <UserName beforeText={i18n.t('backend:email.hi', { lng })} userName={userName} />}
        <Text>
          <span
            // biome-ignore lint/security/noDangerouslySetInnerHtml: <explanation>
            dangerouslySetInnerHTML={{
              __html: i18n.t('backend:email.member_invite.text', { lng, orgName, appName, inviteBy }),
            }}
          />
        </Text>

        {/* User is sent to org invite page, where this invitation token will be used to accept invitation. If not already signed in, 
        it will either forward user to sign in if user exists, or to sign up if user does not exist. */}
        <EmailButton ButtonText={i18n.t('common:accept', { lng })} href={`${config.frontendUrl}/invitation/${token}`} />

        <Text style={{ fontSize: '.75rem', color: '#6a737d', margin: '0.5rem 0 0 0', textAlign: 'center' }}>
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
