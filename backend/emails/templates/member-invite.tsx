import { type EntityRole, hierarchy } from 'shared';
import { EmailMessage } from '../components';
import { i18n, plainText } from '../i18n';
import { senderEndingFor, senderHtml } from '../shared-texts';
import { defineEmailTemplate, type EmailRecipient, plainParam } from '../types';

interface MemberInviteStatic {
  senderName: string;
  /** The inviter's address, which replies reach; shown beside the name. */
  senderEmail?: string;
  entityName: string;
  role: EntityRole;
}

type MemberInviteRecipient = EmailRecipient & { name: string; memberInviteLink: string };

/** For existing users; new users get member-invite-with-token. */
export const memberInviteEmail = defineEmailTemplate<MemberInviteStatic, MemberInviteRecipient>()({
  translate(lng, { senderName, senderEmail, entityName, role }, param = plainParam) {
    return {
      subject: i18n.t('backend:email.member_invite.subject', { lng, senderName, entityName, ...plainText }),
      previewText: i18n.t('backend:email.member_invite.preview', { lng, entityName, ...plainText }),
      headerHtml: i18n.t('backend:email.member_invite.title', { lng, entityName }),
      hiText: i18n.t('backend:email.hi', { lng, name: param('name'), ...plainText }),
      // The sender is translated HTML whose name and address were escaped there; the text splices it in as it is.
      bodyHtml: i18n.t('backend:email.member_invite.text', {
        lng,
        entityName,
        sender: senderHtml(lng, senderName, senderEmail),
        role: i18n.t(`c:${role}`, { lng }),
      }),
      buttonText: i18n.t('c:accept', { lng }),
      endingHtml: senderEndingFor(lng, { senderName, senderEmail, ignorable: true }),
      supportText: i18n.t('backend:email.support_email', { lng }),
      senderName,
    };
  },
  component({ previewText, headerHtml, hiText, bodyHtml, buttonText, endingHtml, supportText, senderName, memberInviteLink, frame }) {
    return (
      <EmailMessage
        frame={frame}
        previewText={previewText}
        avatarName={senderName}
        headerHtml={headerHtml}
        greeting={hiText}
        bodyHtml={bodyHtml}
        action={{ label: buttonText, href: memberInviteLink }}
        endingHtml={endingHtml}
        supportText={supportText}
      />
    );
  },
  preview: {
    statics: {
      senderName: 'John Doe',
      senderEmail: 'john.doe@acme.example',
      entityName: 'Acme',
      role: hierarchy.getLeastPrivilegedRole('organization'),
    },
    recipient: { name: 'Emily', memberInviteLink: 'https://example.com/invite' },
  },
});
