import { EmailButton, EmailLayout, EmailText } from '../../../../emails/components';
import { i18n, plainText } from '../../../../emails/i18n';
import { defineEmailTemplate, type EmailRecipient } from '../../../../emails/types';

interface MentionStatic {
  /** Empty string when the actor is gone; the copy falls back to a generic subject. */
  actorName: string;
  channelName: string;
}

/** Per-recipient props of an instant email about one subject: the mention mail and the comment mail. */
export type SubjectEmailRecipient = EmailRecipient & {
  subjectTitle: string;
  excerpt: string;
  link: string;
  unsubscribeLink: string;
};

interface SubjectEmailProps extends Omit<SubjectEmailRecipient, keyof EmailRecipient> {
  previewText: string;
  headerHtml: string;
  inText: string;
  buttonText: string;
  unsubscribeText: string;
  supportText: string;
}

/** The body every instant email shares: where, the subject's title and excerpt, a link and an unsubscribe line. */
export const SubjectEmail = ({
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
}: SubjectEmailProps) => (
  <EmailLayout
    previewText={previewText}
    headerHtml={headerHtml}
    unsubscribe={{ label: unsubscribeText, href: unsubscribeLink }}
    supportText={supportText}
  >
    <EmailText>{inText}</EmailText>
    <EmailText>
      <strong>{subjectTitle}</strong>
    </EmailText>
    <EmailText>{excerpt}</EmailText>
    <EmailButton ButtonText={buttonText} href={link} />
  </EmailLayout>
);

/**
 * Instant email for a direct mention: the one activity email that is on by default, because a
 * mention is addressed to you while ambient comment activity is not.
 *
 * Lives in the module, not `backend/emails/templates`, keeping the feature self-contained; the
 * mailer takes any template satisfying the contract regardless of where it sits.
 */
export const mentionEmail = defineEmailTemplate<MentionStatic, SubjectEmailRecipient>()({
  translate(lng, { actorName, channelName }) {
    return {
      subject: i18n.t('c:email.mention.subject', { lng, actorName, channelName, ...plainText }),
      previewText: i18n.t('c:email.mention.preview', { lng, actorName, ...plainText }),
      headerHtml: i18n.t('c:email.mention.title', { lng, actorName }),
      inText: i18n.t('c:email.mention.in', { lng, channelName, ...plainText }),
      buttonText: i18n.t('c:email.mention.button', { lng }),
      unsubscribeText: i18n.t('c:email.unsubscribe_mentions', { lng }),
      supportText: i18n.t('backend:email.support_email', { lng }),
    };
  },
  component(props) {
    return <SubjectEmail {...props} />;
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
