import { Column, Img, Row, Section, Text } from 'jsx-email';

import { config } from 'config';
import { i18n } from '../../backend/src/lib/i18n';

import Avatar from './components/avatar';
import { EmailContainer } from './components/container';
import { EmailButton } from './components/email-button';
import { EmailHeader } from './components/email-header';
import { EmailReplyTo } from './components/email-reply-to';
import { Footer } from './components/footer';
import { UserName } from './components/user-name';
import type { BasicTemplateType } from './types';

interface Props extends BasicTemplateType {
  token: string;
  inviteBy: string;
  inviterEmail: string;
  organizationName?: string;
  organizationThumbnailUrl?: string | null;
}

const productionUrl = config.productionUrl;
const appName = config.name;

export const InviteMemberEmail = ({
  userName,
  userLanguage: lng,
  userThumbnailUrl,
  inviteBy,
  organizationName,
  inviterEmail,
  organizationThumbnailUrl,
  token,
}: Props) => {
  const orgName = organizationName || i18n.t('common:unknown_organization', { lng });

  return (
    <EmailContainer
      previewText={i18n.t('backend:email.invite_in_organization_preview_text', { lng, orgName, appName })}
      containerStyle={{
        marginTop: '2.5rem',
        marginBottom: '2.5rem',
        width: '32rem',
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
          borderRadius: '0.25rem',
          borderWidth: '1px',
          borderStyle: 'solid',
          borderColor: '#eaeaea',
          padding: '1rem',
        }}
      >
        <UserName userName={userName}>
          <Text>{i18n.t('backend:email.hi', { lng })}</Text>
        </UserName>
        <UserName userName={inviteBy}>
          <div
            // biome-ignore lint/security/noDangerouslySetInnerHtml: <explanation>
            dangerouslySetInnerHTML={{
              __html: i18n.t('backend:email.invite_to_organization_description', { lng, orgName, appName }),
            }}
          />
        </UserName>
        <Row>
          <Column align="right">
            <Avatar url={userThumbnailUrl} type="user" />
          </Column>
          <Column align="center">
            <Img src={`${productionUrl}/static/email/arrow.png`} width="12" height="9" alt="invited to" />
          </Column>
          <Column align="left">
            <Avatar url={organizationThumbnailUrl} type="organization" />
          </Column>
        </Row>
        <EmailButton ButtonText={i18n.t('common:accept', { lng })} href={`${config.frontendUrl}/auth/invite/${token}`} />
        <Text style={{ fontSize: '.75rem', color: '#6a737d', margin: '0.5rem 0 0 0' }}>{i18n.t('backend:email.invite_expire', { lng })}</Text>
      </Section>
      <EmailReplyTo email={inviterEmail} />
      <Footer />
    </EmailContainer>
  );
};

export default InviteMemberEmail;
