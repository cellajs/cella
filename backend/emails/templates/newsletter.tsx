import { Link } from 'jsx-email';
import { EmailBody, EmailContainer, EmailHeader, EmailLogo, Footer, Text } from '../components';
import i18n from '../i18n';
import { newsletterContentStyles, smallTextStyle } from '../styles';
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
    <EmailContainer
      previewText={subject}
      containerStyle={{ maxWidth: '40rem' }}
      headChildren={<style>{newsletterContentStyles}</style>}
    >
      <EmailHeader
        headerText={
          <div dangerouslySetInnerHTML={{ __html: i18n.t('backend:email.newsletter.title', { orgName, lng }) }} />
        }
      />
      <EmailBody>
        <Text>{testEmail && 'THIS IS A TEST'}</Text>

        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: sys admin content */}
        <div className="bn-email-content" dangerouslySetInnerHTML={{ __html: content }} />

        <div style={{ textAlign: 'center', marginTop: '2rem' }}>
          <Link style={smallTextStyle} href={unsubscribeLink}>
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

// Preview props for jsx-email CLI
export const previewProps = {
  lng: 'en',
  subject: 'Monthly newsletter',
  orgName: 'Acme',
  content: [
    "<h2>What's new this month</h2>",
    "<p>We've been working hard on some exciting updates. Here's a quick summary of what's changed:</p>",
    '<h3>Improved performance</h3>',
    '<p>Page load times are now <strong>40% faster</strong> thanks to our new caching layer. Check out the <a href="https://example.com/docs">documentation</a> for details.</p>',
    '<ul><li>Faster API responses</li><li>Reduced bundle size</li><li>Better image optimization</li></ul>',
    '<h3>New features</h3>',
    '<ol><li>Dark mode support</li><li>Export to PDF</li><li>Keyboard shortcuts</li></ol>',
    "<p>Here's a quick code snippet: <code>npx update@latest</code></p>",
    '<div class="notify" data-notify-type="info"><div class="inline-content"><p>Tip: Enable notifications to stay updated on new releases.</p></div></div>',
    '<div class="notify" data-notify-type="warning"><div class="inline-content"><p>Reminder: API v1 will be deprecated on March 1st.</p></div></div>',
    "<p>That's all for now. Stay tuned for more updates!</p>",
  ].join('\n'),
  unsubscribeLink: 'https://cellajs.com/unsubscribe?token=preview-token',
} satisfies NewsletterEmailProps;
