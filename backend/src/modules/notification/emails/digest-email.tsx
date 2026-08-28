import {
  EmailBody,
  EmailContainer,
  EmailFooter,
  EmailHeader,
  EmailLogo,
  EmailText,
  SafeHtml,
} from '../../../../emails/components';
import { Link } from '../../../../emails/components/primitives';
import { i18n } from '../../../../emails/i18n';
import { smallTextStyle } from '../../../../emails/styles';
import { defineEmailTemplate, type EmailRecipient } from '../../../../emails/types';

interface DigestStatic {
  daily: boolean;
}

/**
 * `sectionsHtml` is pre-rendered per recipient because the mailer renders one HTML body per
 * language and fills the rest through Brevo placeholders, which are strings only. Building the
 * channel list as sanitised HTML upstream is what lets one render serve every recipient.
 */
type DigestRecipient = EmailRecipient & {
  sectionsHtml: string;
  unsubscribeLink: string;
};

export const digestEmail = defineEmailTemplate<DigestStatic, DigestRecipient>()({
  translate(lng, { daily }) {
    const key = daily ? 'daily' : 'weekly';
    return {
      subject: i18n.t(`c:email.digest.${key}.subject`, { lng }),
      previewText: i18n.t(`c:email.digest.${key}.preview`, { lng }),
      headerHtml: i18n.t(`c:email.digest.${key}.title`, { lng }),
      introText: i18n.t('c:email.digest.intro', { lng }),
      unsubscribeText: i18n.t('c:email.unsubscribe_digest', { lng }),
      supportText: i18n.t('backend:email.support_email', { lng }),
    };
  },
  component({ previewText, headerHtml, introText, unsubscribeText, supportText, sectionsHtml, unsubscribeLink }) {
    return (
      <EmailContainer previewText={previewText} containerStyle={{ maxWidth: '40rem' }}>
        <EmailHeader headerText={<SafeHtml html={headerHtml} policy="inline" as="div" />} />
        <EmailBody>
          <EmailText>{introText}</EmailText>

          <SafeHtml html={sectionsHtml} policy="richText" as="div" />

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
  preview: {
    statics: { daily: false },
    recipient: {
      sectionsHtml: '<h3>Design 101</h3><ul><li>2 new mentions</li><li>5 new posts</li></ul>',
      unsubscribeLink: 'https://example.com/unsubscribe',
    },
  },
});
