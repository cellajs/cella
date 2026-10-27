import { SubjectEmail, type SubjectEmailRecipient } from '#/modules/notification/emails/subject-email';
import { i18n, plainText } from '../../../../emails/i18n';
import { defineEmailTemplate } from '../../../../emails/types';

interface MentionStatic {
  /** Empty string when the actor is gone; the copy falls back to a generic subject. */
  actorName: string;
  channelName: string;
}

/**
 * Instant email for a direct mention: the one activity email that is on by default, because a
 * mention is addressed to you while ambient comment activity is not.
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
