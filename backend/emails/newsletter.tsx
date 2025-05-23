import i18n from 'i18next';
import { Link, Text } from 'jsx-email';

import type { BasicTemplateType } from '../src/lib/mailer';
import { AppLogo } from './components/app-logo';
import { EmailContainer } from './components/container';
import { EmailBody } from './components/email-body';
import { EmailHeader } from './components/email-header';
import { Footer } from './components/footer';

export interface NewsletterEmailProps extends BasicTemplateType {
  orgName: string;
  content: string;
}

export const NewsletterEmail = ({ lng, content, subject, unsubscribeLink, orgName, testEmail }: NewsletterEmailProps) => {
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
        <Text>{testEmail && 'THIS IS A TEST'}</Text>
        <Text>{subject}</Text>

        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: <explanation>*/}
        <div dangerouslySetInnerHTML={{ __html: content }} />

        <div style={{ textAlign: 'center', marginTop: '2rem' }}>
          <Link style={{ fontSize: '.85rem', lineHeight: '1.13rem' }} href={unsubscribeLink}>
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
