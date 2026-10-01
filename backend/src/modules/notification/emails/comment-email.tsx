import { i18n, plainText } from '../../../../emails/i18n';
import { defineEmailTemplate } from '../../../../emails/types';
import { SubjectEmail, type SubjectEmailRecipient } from './mention-email';

interface CommentStatic {
  /** Empty string when the actor is gone. */
  actorName: string;
  channelName: string;
  /** A `reply` notification, else a `comment`. */
  reply: boolean;
}

/**
 * Instant email for a comment or reply notification. Off unless the app sets `has.commentEmail` and
 * the recipient turns comment emails on; a mention on the same subject is mailed as a mention.
 */
export const commentEmail = defineEmailTemplate<CommentStatic, SubjectEmailRecipient>()({
  translate(lng, { actorName, channelName, reply }) {
    const key = reply ? 'reply' : 'comment';
    return {
      subject: i18n.t(`c:email.${key}.subject`, { lng, actorName, channelName, ...plainText }),
      previewText: i18n.t(`c:email.${key}.preview`, { lng, actorName, ...plainText }),
      headerHtml: i18n.t(`c:email.${key}.title`, { lng, actorName }),
      inText: i18n.t('c:email.mention.in', { lng, channelName, ...plainText }),
      buttonText: i18n.t('c:email.mention.button', { lng }),
      unsubscribeText: i18n.t('c:email.unsubscribe_comments', { lng }),
      supportText: i18n.t('backend:email.support_email', { lng }),
    };
  },
  component(props) {
    return <SubjectEmail {...props} />;
  },
  preview: {
    statics: { actorName: 'John', channelName: 'Design 101', reply: false },
    recipient: {
      subjectTitle: 'Roadmap review',
      excerpt: 'I added the dates we discussed.',
      link: 'https://example.com/acme',
      unsubscribeLink: 'https://example.com/unsubscribe',
    },
  },
});
