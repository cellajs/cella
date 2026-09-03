import {
  EmailBody,
  EmailButton,
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
import type { NotificationType } from '../notification-types';

interface NotificationStatic {
  type: NotificationType;
  /** Empty string when the actor is gone; the copy falls back to a generic subject. */
  actorName: string;
  channelName: string;
}

type NotificationRecipient = EmailRecipient & {
  subjectTitle: string;
  excerpt: string;
  link: string;
  unsubscribeLink: string;
};

/**
 * Instant email for one notification. Copy comes from `c:email.<type>.*` when the type has its own
 * keys (the template types do; apps add theirs to `app.json`), else the generic
 * `c:email.notification.*` set.
 *
 * Lives in the module, not `backend/emails/templates`, keeping the feature self-contained; the
 * mailer takes any template satisfying the contract regardless of where it sits.
 */
export const notificationEmail = defineEmailTemplate<NotificationStatic, NotificationRecipient>()({
  translate(lng, { type, actorName, channelName }) {
    const copy = (part: 'subject' | 'preview' | 'title') =>
      i18n.t(`c:email.${type}.${part}`, {
        lng,
        actorName,
        channelName,
        defaultValue: i18n.t(`c:email.notification.${part}`, { lng, actorName, channelName }),
      });
    return {
      subject: copy('subject'),
      previewText: copy('preview'),
      headerHtml: copy('title'),
      inText: i18n.t('c:email.notification.in', { lng, channelName }),
      buttonText: i18n.t('c:email.notification.button', { lng }),
      unsubscribeText: i18n.t('c:email.unsubscribe_notification', { lng }),
      supportText: i18n.t('backend:email.support_email', { lng }),
    };
  },
  component({
    previewText,
    headerHtml,
    inText,
    buttonText,
    unsubscribeText,
    supportText,
    subjectTitle,
    excerpt,
    link,
    unsubscribeLink,
  }) {
    return (
      <EmailContainer previewText={previewText}>
        <EmailHeader headerText={<SafeHtml html={headerHtml} policy="inline" as="div" />} />
        <EmailBody>
          <EmailText>{inText}</EmailText>
          <EmailText>
            <strong>{subjectTitle}</strong>
          </EmailText>
          <EmailText>
            <SafeHtml html={excerpt} policy="inline" />
          </EmailText>

          <EmailButton ButtonText={buttonText} href={link} />

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
    statics: { type: 'mention', actorName: 'John', channelName: 'Design 101' },
    recipient: {
      subjectTitle: 'Roadmap review',
      excerpt: 'Could you take a look at this before Friday?',
      link: 'https://example.com/acme',
      unsubscribeLink: 'https://example.com/unsubscribe',
    },
  },
});
