import { config } from 'config';
import { Column, Row, Section, Text } from 'jsx-email';
import { i18n } from '../../backend/src/lib/i18n';

import { AppLogo } from './components/app-logo';
import { ArrowRight } from './components/arrow-right';
import Avatar from './components/avatar';
import { EmailContainer } from './components/container';
import { EmailButton } from './components/email-button';
import { EmailHeader } from './components/email-header';
import { Footer } from './components/footer';
import UserName from './components/user-name';
import type { BasicTemplateType } from './types';

interface Props extends BasicTemplateType {
  token: string;
  inviteBy: string;
  inviterEmail: string;
  organizationName?: string;
  organizationThumbnailUrl?: string | null;
}

const appName = config.name;

export const InviteMemberEmail = ({ userName, userLanguage: lng, inviteBy, organizationName, token }: Props) => {
  const orgName = organizationName || i18n.t('common:unknown_organization', { lng });

  return (
    <EmailContainer
      previewText={i18n.t('backend:email.invite_in_organization_preview_text', { lng, orgName, appName })}
      containerStyle={{
        marginTop: '2.5rem',
        marginBottom: '2.5rem',
        width: '50rem',
      }}
    >
      <EmailHeader
        headerText={
          <div
            // biome-ignore lint/security/noDangerouslySetInnerHtml: <explanation>
            dangerouslySetInnerHTML={{
              __html: i18n.t('backend:email.invite_to_organization_title', { lng, orgName }),
            }}
          />
        }
      />
      <Section
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          borderRadius: '.75rem',
          borderWidth: '1px',
          borderStyle: 'solid',
          borderColor: '#eaeaea',
          padding: '1.5rem',
        }}
      >
        <UserName beforeText={i18n.t('backend:email.hi', { lng })} userName={userName} />
        <UserName beforeText={i18n.t('backend:email.invite_to_organization_description', { lng, orgName, appName })} userName={inviteBy} />

        <Row style={{ margin: '1.5rem 0 1rem' }}>
          <Column align="right">
            <Avatar name={userName} type="user" />
          </Column>
          <Column align="center">
            <ArrowRight />
          </Column>
          <Column align="left">
            <Avatar name={organizationName} type="organization" />
          </Column>
        </Row>
        <EmailButton ButtonText={i18n.t('common:accept', { lng })} href={`${config.frontendUrl}/auth/invite/${token}`} />
        <Text style={{ fontSize: '.75rem', color: '#6a737d', margin: '0.5rem 0 0 0' }}>{i18n.t('backend:email.invite_expire', { lng })}</Text>
      </Section>

      <AppLogo />
      <Footer />
    </EmailContainer>
  );
};

export default InviteMemberEmail;
