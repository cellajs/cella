import { EmailLayout, EmailText, SafeHtml } from '../components';
import { i18n } from '../i18n';
import { newsletterContentStyles } from '../styles';
import { defineEmailTemplate, type EmailRecipient, plainParam } from '../types';

interface NewsletterStatic {
  content: string;
  subject: string;
  testEmail?: boolean;
}

type NewsletterRecipient = EmailRecipient & { unsubscribeLink: string; orgName: string };

export const newsletterEmail = defineEmailTemplate<NewsletterStatic, NewsletterRecipient>()({
  translate(lng, { content, subject, testEmail }, param = plainParam) {
    return {
      subject,
      headerHtml: i18n.t('backend:email.newsletter.title', { orgName: param('orgName'), lng }),
      unsubscribeText: i18n.t('backend:email.unsubscribe', { lng }),
      supportText: i18n.t('backend:email.support_email', { lng }),
      content,
      testEmail: testEmail ?? false,
    };
  },
  component({ subject, headerHtml, unsubscribeText, supportText, content, testEmail, unsubscribeLink }) {
    return (
      <EmailLayout
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
  preview: {
    statics: { content: '<p>Test content</p>', subject: 'Monthly newsletter', testEmail: false },
    recipient: { unsubscribeLink: 'https://example.com/unsubscribe', orgName: 'Acme' },
  },
});
