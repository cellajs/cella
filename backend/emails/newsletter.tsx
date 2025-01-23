import { Link, Text } from 'jsx-email';
import { i18n } from '../src/lib/i18n';

import { AppLogo } from './components/app-logo';
import { EmailContainer } from './components/container';
import { EmailBody } from './components/email-body';
import { EmailHeader } from './components/email-header';
import { Footer } from './components/footer';
import type { BasicTemplateType } from './types';

interface Props extends BasicTemplateType {
  orgName: string;
  content: string;
  subject: string;
  unsubscribeLink: string;
}

export const NewsletterEmail = ({ userLanguage: lng, content, subject, unsubscribeLink, orgName }: Props) => {
  return (
    <EmailContainer previewText={subject}>
      <EmailHeader
        headerText={
          <div
            // biome-ignore lint/security/noDangerouslySetInnerHtml: <explanation>
            dangerouslySetInnerHTML={{
              __html: i18n.t('backend:email.newsletter.title', { orgName, lng }),
            }}
          />
        }
      />
      <EmailBody>
        <Text>{subject}</Text>

        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: <explanation>*/}
        <div dangerouslySetInnerHTML={{ __html: content }} />

        <div style={{ textAlign: 'center', marginTop: '2rem' }}>
          <Link style={{ fontSize: '.75rem', lineHeight: '1.13rem' }} href={unsubscribeLink}>
            {i18n.t('backend:email.unsubscribe', { lng })}
          </Link>
        </div>
      </EmailBody>

      <AppLogo />
      <Footer />
    </EmailContainer>
  );
};

// Template export
export const Template = NewsletterEmail;
