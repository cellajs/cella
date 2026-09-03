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

interface MentionStatic {
  /** Empty string when the actor is gone; the copy falls back to a generic subject. */
  actorName: string;
  channelName: string;
}

type MentionRecipient = EmailRecipient & {
  subjectTitle: string;
  excerpt: string;
  link: string;
  unsubscribeLink: string;
};

/**
 * Instant email for a direct mention: the one activity email that is on by default, because a
 * mention is addressed to you while ambient comment activity is not.
 *
 * Lives in the module, not `backend/emails/templates`, keeping the feature self-contained; the
 * mailer takes any template satisfying the contract regardless of where it sits.
 */
export const mentionEmail = defineEmailTemplate<MentionStatic, MentionRecipient>()({
  translate(lng, { actorName, channelName }) {
    return {
      subject: i18n.t('c:email.mention.subject', { lng, actorName, channelName }),
      previewText: i18n.t('c:email.mention.preview', { lng, actorName }),
      headerHtml: i18n.t('c:email.mention.title', { lng, actorName }),
      inText: i18n.t('c:email.mention.in', { lng, channelName }),
      buttonText: i18n.t('c:email.mention.button', { lng }),
      unsubscribeText: i18n.t('c:email.unsubscribe_mentions', { lng }),
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
    statics: { actorName: 'John', channelName: 'Design 101' },
    recipient: {
      subjectTitle: 'Roadmap review',
      excerpt: 'Could you take a look at this before Friday?',
      link: 'https://example.com/acme',
      unsubscribeLink: 'https://example.com/unsubscribe',
    },
  },
});
