import { appConfig, type EntityRole, hierarchy } from 'shared';
import { EmailMessage } from '../components';
import { i18n, plainText } from '../i18n';
import { defineEmailTemplate, type EmailRecipient, plainParam } from '../types';

interface MemberInviteWithTokenStatic {
  senderName: string;
  entityName: string;
  role: EntityRole;
}

type MemberInviteWithTokenRecipient = EmailRecipient & { name: string; inviteLink: string };

const appName = appConfig.name;

/** For new users, who need the token; existing users get member-invite. */
export const memberInviteWithTokenEmail = defineEmailTemplate<
  MemberInviteWithTokenStatic,
  MemberInviteWithTokenRecipient
>()({
  translate(lng, { senderName, entityName, role }, param = plainParam) {
    return {
      subject: i18n.t('backend:email.member_invite.subject', { lng, entityName, ...plainText }),
      previewText: i18n.t('backend:email.member_invite.preview', { lng, entityName, appName, ...plainText }),
      headerHtml: i18n.t('backend:email.member_invite.title', { lng, entityName }),
      hiText: i18n.t('backend:email.hi', { lng, name: param('name'), ...plainText }),
      bodyHtml: i18n.t('backend:email.member_invite.text', { lng, entityName, appName, senderName, role }),
      inviteExpires: i18n.t('backend:email.invite_expires', { lng }),
      buttonText: i18n.t('c:join', { lng }),
      supportText: i18n.t('backend:email.support_email', { lng }),
      senderName,
    };
  },
  component({
    previewText,
    headerHtml,
    hiText,
    bodyHtml,
    inviteExpires,
    buttonText,
    supportText,
    senderName,
    inviteLink,
  }) {
    return (
      <EmailMessage
        previewText={previewText}
        avatarName={senderName}
        headerHtml={headerHtml}
        greeting={hiText}
        bodyHtml={bodyHtml}
        action={{ label: buttonText, href: inviteLink }}
        note={inviteExpires}
        supportText={supportText}
      />
    );
  },
  preview: {
    statics: { senderName: 'John', entityName: 'Acme', role: hierarchy.getLeastPrivilegedRole('organization') },
    recipient: { name: 'Emily', inviteLink: 'https://example.com/invite' },
  },
});
