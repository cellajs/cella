import { SubjectEmail, type SubjectEmailRecipient } from '#/modules/notification/emails/subject-email';
import { i18n, plainText } from '../../../../emails/i18n';
import { defineEmailTemplate, plainParam } from '../../../../emails/types';

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
  translate(lng, { actorName, channelName, reply }, param = plainParam) {
    const key = reply ? 'reply' : 'comment';
    return {
      subject: i18n.t(`c:email.${key}.subject`, { lng, actorName, channelName, ...plainText }),
      hiText: i18n.t('backend:email.hi', { lng, name: param('name'), ...plainText }),
      previewText: param('subjectTitle'),
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
  listUnsubscribe: 'unsubscribeLink',
  preview: {
    statics: { actorName: 'John', channelName: 'Design 101', reply: false },
    recipient: {
      name: 'Emily',
      subjectTitle: 'Roadmap review',
      excerpt: 'I added the dates we discussed.',
      link: 'https://example.com/acme',
      unsubscribeLink: 'https://example.com/unsubscribe',
    },
  },
});
