import { EmailLayout, EmailText, SafeHtml } from '../../../../emails/components';
import { i18n, plainText } from '../../../../emails/i18n';
import { greetingStyle } from '../../../../emails/styles';
import { defineEmailTemplate, type EmailRecipient, plainParam } from '../../../../emails/types';

interface DigestStatic {
  daily: boolean;
}

/**
 * `sectionsHtml` is pre-rendered per recipient because the mailer renders one HTML body per
 * language and fills the rest through Brevo placeholders, which are strings only. It is a declared
 * HTML param: `renderSectionsHtml` escapes every user-derived fragment, and Brevo prints it as is.
 */
type DigestRecipient = EmailRecipient & { name: string; sectionsHtml: string; unsubscribeLink: string };

/** The daily or weekly digest: a recipient's unread notifications in sections per channel. */
export const digestEmail = defineEmailTemplate<DigestStatic, DigestRecipient>()({
  translate(lng, { daily }, param = plainParam) {
    const key = daily ? 'daily' : 'weekly';
    return {
      subject: i18n.t(`c:email.digest.${key}.subject`, { lng }),
      previewText: i18n.t(`c:email.digest.${key}.preview`, { lng }),
      headerHtml: i18n.t(`c:email.digest.${key}.title`, { lng }),
      hiText: i18n.t('backend:email.hi', { lng, name: param('name'), ...plainText }),
      introText: i18n.t('c:email.digest.intro', { lng }),
      unsubscribeText: i18n.t('c:email.unsubscribe_digest', { lng }),
      supportText: i18n.t('backend:email.support_email', { lng }),
    };
  },
  component({ previewText, headerHtml, hiText, introText, unsubscribeText, supportText, sectionsHtml, unsubscribeLink, frame }) {
    return (
      <EmailLayout
        frame={frame}
        previewText={previewText}
        headerHtml={headerHtml}
        wide
        unsubscribe={{ label: unsubscribeText, href: unsubscribeLink }}
        supportText={supportText}
      >
        <EmailText style={greetingStyle}>{hiText}</EmailText>
        <EmailText>{introText}</EmailText>
        <SafeHtml html={sectionsHtml} policy="richText" as="div" />
      </EmailLayout>
    );
  },
  htmlParams: { sectionsHtml: 'richText' },
  preview: {
    statics: { daily: false },
    recipient: {
      name: 'Emily',
      sectionsHtml: '<h3>Design 101</h3><ul><li>2 new mentions</li><li>5 new posts</li></ul>',
      unsubscribeLink: 'https://example.com/unsubscribe',
    },
  },
});
