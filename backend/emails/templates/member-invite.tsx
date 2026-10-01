import { appConfig, type EntityRole, hierarchy } from 'shared';
import { EmailMessage } from '../components';
import { i18n, plainText } from '../i18n';
import { defineEmailTemplate, type EmailRecipient, plainParam } from '../types';

interface MemberInviteStatic {
  senderName: string;
  entityName: string;
  role: EntityRole;
}

type MemberInviteRecipient = EmailRecipient & { name: string; memberInviteLink: string };

const appName = appConfig.name;

/** For existing users; new users get member-invite-with-token. */
export const memberInviteEmail = defineEmailTemplate<MemberInviteStatic, MemberInviteRecipient>()({
  translate(lng, { senderName, entityName, role }, param = plainParam) {
    return {
      subject: i18n.t('backend:email.member_invite.subject', { lng, entityName, ...plainText }),
      previewText: i18n.t('backend:email.member_invite.preview', { lng, entityName, appName, ...plainText }),
      headerHtml: i18n.t('backend:email.member_invite.title', { lng, entityName }),
      hiText: i18n.t('backend:email.hi', { lng, name: param('name'), ...plainText }),
      bodyHtml: i18n.t('backend:email.member_invite.text', { lng, entityName, appName, senderName, role }),
      buttonText: i18n.t('c:accept', { lng }),
      supportText: i18n.t('backend:email.support_email', { lng }),
      senderName,
    };
  },
  component({ previewText, headerHtml, hiText, bodyHtml, buttonText, supportText, senderName, memberInviteLink }) {
    return (
      <EmailMessage
        previewText={previewText}
        avatarName={senderName}
        headerHtml={headerHtml}
        greeting={hiText}
        bodyHtml={bodyHtml}
        action={{ label: buttonText, href: memberInviteLink }}
        supportText={supportText}
      />
    );
  },
  preview: {
    statics: { senderName: 'John', entityName: 'Acme', role: hierarchy.getLeastPrivilegedRole('organization') },
    recipient: { name: 'Emily', memberInviteLink: 'https://example.com/invite' },
  },
});
