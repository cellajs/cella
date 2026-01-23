import i18n from 'i18next';
import { Link, Text } from 'jsx-email';
import { EmailBody } from '../components/email-body';
import { EmailContainer } from '../components/email-container';
import { EmailHeader } from '../components/email-header';
import { EmailLogo } from '../components/email-logo';
import { Footer } from '../components/footer';
import type { BasicTemplateType } from '../types';

interface NewsletterEmailProps extends BasicTemplateType {
  orgName: string;
  content: string;
}

/**
 * Email template for newsletters sent to users in one or more organizations.
 */
export const NewsletterEmail = ({
  lng,
  content,
  subject,
  unsubscribeLink,
  orgName,
  testEmail,
}: NewsletterEmailProps) => {
  return (
    <EmailContainer previewText={subject}>
      <EmailHeader
        headerText={
          <div dangerouslySetInnerHTML={{ __html: i18n.t('backend:email.newsletter.title', { orgName, lng }) }} />
        }
      />
      <EmailBody>
        <Text>{testEmail && 'THIS IS A TEST'}</Text>
        <Text>{subject}</Text>

        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: sys admin content */}
        <div dangerouslySetInnerHTML={{ __html: content }} />

        <div style={{ textAlign: 'center', marginTop: '2rem' }}>
          <Link style={{ fontSize: '.85rem', lineHeight: '1.13rem' }} href={unsubscribeLink}>
            {i18n.t('backend:email.unsubscribe', { lng })}
          </Link>
        </div>
      </EmailBody>

      <EmailLogo />
      <Footer />
    </EmailContainer>
  );
};

// Template export
export const Template = NewsletterEmail;
