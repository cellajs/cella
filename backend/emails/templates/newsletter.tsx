import { EmailLayout, EmailText, SafeHtml } from '../components';
import { i18n } from '../i18n';
import { newsletterContentStyles } from '../styles';
import { defineEmailTemplate, type EmailRecipient } from '../types';

interface NewsletterStatic {
  content: string;
  subject: string;
  testEmail?: boolean;
}

type NewsletterRecipient = EmailRecipient & { unsubscribeLink: string };

export const newsletterEmail = defineEmailTemplate<NewsletterStatic, NewsletterRecipient>()({
  translate(lng, { content, subject, testEmail }) {
    return {
      subject,
      headerHtml: i18n.t('backend:email.newsletter.title', { lng }),
      unsubscribeText: i18n.t('backend:email.unsubscribe', { lng }),
      supportText: i18n.t('backend:email.support_email', { lng }),
      content,
      testEmail: testEmail ?? false,
    };
  },
  component({ subject, headerHtml, unsubscribeText, supportText, content, testEmail, unsubscribeLink, frame }) {
    return (
      <EmailLayout
        frame={frame}
        previewText={subject}
        headerHtml={headerHtml}
        wide
        headChildren={<style>{newsletterContentStyles}</style>}
        unsubscribe={{ label: unsubscribeText, href: unsubscribeLink }}
        supportText={supportText}
      >
        {testEmail && <EmailText>THIS IS A TEST</EmailText>}
        <SafeHtml html={content} policy="richText" as="div" className="bn-email-content" />
      </EmailLayout>
    );
  },
  listUnsubscribe: 'unsubscribeLink',
  preview: {
    statics: { content: '<p>Test content</p>', subject: 'Monthly newsletter', testEmail: false },
    recipient: { unsubscribeLink: 'https://example.com/unsubscribe' },
  },
});
