import { type EntityRole, hierarchy } from 'shared';
import { EmailMessage } from '../components';
import { i18n, plainText } from '../i18n';
import { linkExpiresText, senderEndingFor, senderHtml } from '../shared-texts';
import { defineEmailTemplate, type EmailRecipient, plainParam } from '../types';

interface MemberInviteWithTokenStatic {
  senderName: string;
  /** The inviter's address, which replies reach; shown beside the name. */
  senderEmail?: string;
  entityName: string;
  role: EntityRole;
}

type MemberInviteWithTokenRecipient = EmailRecipient & { name: string; inviteLink: string };

/** For new users, who need the token; existing users get member-invite. */
export const memberInviteWithTokenEmail = defineEmailTemplate<MemberInviteWithTokenStatic, MemberInviteWithTokenRecipient>()({
  translate(lng, { senderName, senderEmail, entityName, role }, param = plainParam) {
    return {
      subject: i18n.t('backend:email.member_invite.subject', { lng, senderName, entityName, ...plainText }),
      previewText: i18n.t('backend:email.member_invite.preview', { lng, entityName, ...plainText }),
      headerHtml: i18n.t('backend:email.member_invite.title', { lng, entityName }),
      hiText: i18n.t('backend:email.hi', { lng, name: param('name'), ...plainText }),
      bodyHtml: i18n.t('backend:email.member_invite.text', {
        lng,
        entityName,
        sender: senderHtml(lng, senderName, senderEmail),
        role: i18n.t(`c:${role}`, { lng }),
      }),
      expiresText: linkExpiresText(lng, 'invitation'),
      buttonText: i18n.t('c:join', { lng }),
      endingHtml: senderEndingFor(lng, { senderName, senderEmail, ignorable: true }),
      supportText: i18n.t('backend:email.support_email', { lng }),
      senderName,
    };
  },
  component({ previewText, headerHtml, hiText, bodyHtml, expiresText, buttonText, endingHtml, supportText, senderName, inviteLink, frame }) {
    return (
      <EmailMessage
        frame={frame}
        previewText={previewText}
        avatarName={senderName}
        headerHtml={headerHtml}
        greeting={hiText}
        bodyHtml={bodyHtml}
        action={{ label: buttonText, href: inviteLink }}
        note={expiresText}
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
    recipient: { name: 'Emily', inviteLink: 'https://example.com/invite' },
  },
});
