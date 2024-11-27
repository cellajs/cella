import { Link, Section, Text } from 'jsx-email';
import { i18n } from '../src/lib/i18n';

import { AppLogo } from './components/app-logo';
import { EmailContainer } from './components/container';
import { EmailHeader } from './components/email-header';
import { Footer } from './components/footer';
import { updateBlocknoteHTML } from './helpers';
import type { BasicTemplateType } from './types';

interface Props extends BasicTemplateType {
  orgName: string;
  content: string;
  subject: string;
  unsubscribeLink: string;
}

export const organizationsNewsletter = ({ userLanguage: lng, content, subject, unsubscribeLink, orgName }: Props) => {
  return (
    <EmailContainer
      previewText={subject}
      bodyStyle={{ padding: '0 0.625rem' }}
      containerStyle={{
        borderColor: '#f0f0f0',
        maxWidth: '100%',
        color: '#404040',
        lineHeight: '1.5',
      }}
    >
      <EmailHeader
        headerText={
          <div
            // biome-ignore lint/security/noDangerouslySetInnerHtml: <explanation>
            dangerouslySetInnerHTML={{
              __html: i18n.t('backend:email.newsletter_title', { orgName, lng }),
            }}
          />
        }
      />
      <Section
        style={{
          borderRadius: '.75rem',
          borderWidth: '1px',
          borderStyle: 'solid',
          borderColor: '#eaeaea',
          padding: '1.5rem',
        }}
      >
        <Text>{subject}</Text>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: we need send it cos blackNote return an html*/}
        <div dangerouslySetInnerHTML={{ __html: updateBlocknoteHTML(content) }} />
        <Link
          style={{
            fontSize: '.75rem',
            lineHeight: '1.13rem',
          }}
          href={unsubscribeLink}
        >
          {i18n.t('backend:email.unsubscribe', { lng })}
        </Link>
      </Section>

      <AppLogo />
      <Footer />
    </EmailContainer>
  );
};

export default organizationsNewsletter;
