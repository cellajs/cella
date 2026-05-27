import { Link } from 'jsx-email';
import { EmailBody, EmailContainer, EmailFooter, EmailHeader, EmailLogo, EmailText, SafeHtml } from '../components';
import i18n from '../i18n';
import { newsletterContentStyles, smallTextStyle } from '../styles';
import { defineEmailTemplate, type EmailRecipient } from '../types';

interface NewsletterStatic {
  content: string;
  subject: string;
  testEmail?: boolean;
}

type NewsletterRecipient = EmailRecipient & { unsubscribeLink: string; orgName: string };

/**
 * Email template for newsletters sent to users in one or more organizations.
 */
export const newsletterEmail = defineEmailTemplate<NewsletterStatic, NewsletterRecipient>()({
  translate(lng, { content, subject, testEmail }) {
    return {
      subject,
      headerHtml: i18n.t('backend:email.newsletter.title', { orgName: '{{params.orgName}}', lng }),
      unsubscribeText: i18n.t('backend:email.unsubscribe', { lng }),
      supportText: i18n.t('backend:email.support_email', { lng }),
      content,
      testEmail: testEmail ?? false,
    };
  },
  component({ subject, headerHtml, unsubscribeText, supportText, content, testEmail, unsubscribeLink }) {
    return (
      <EmailContainer
        previewText={subject}
        containerStyle={{ maxWidth: '40rem' }}
        headChildren={<style>{newsletterContentStyles}</style>}
      >
        <EmailHeader headerText={<SafeHtml html={headerHtml} policy="inline" as="div" />} />
        <EmailBody>
          <EmailText>{testEmail && 'THIS IS A TEST'}</EmailText>

          <SafeHtml html={content} policy="richText" as="div" className="bn-email-content" />

          <div style={{ textAlign: 'center', marginTop: '2rem' }}>
            <Link style={smallTextStyle} href={unsubscribeLink}>
              {unsubscribeText}
            </Link>
          </div>
        </EmailBody>

        <EmailLogo />
        <EmailFooter supportText={supportText} />
      </EmailContainer>
    );
  },
});
