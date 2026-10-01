import { appConfig } from 'shared';
import { EmailMessage } from '../components';
import { i18n, plainText } from '../i18n';
import { defineEmailTemplate, type EmailRecipient, plainParam } from '../types';

interface SystemInviteStatic {
  senderName: string;
}

type SystemInviteRecipient = EmailRecipient & { name: string; inviteLink: string };

const appName = appConfig.name;

/** System-level invitation, for new users. */
export const systemInviteEmail = defineEmailTemplate<SystemInviteStatic, SystemInviteRecipient>()({
  translate(lng, { senderName }, param = plainParam) {
    return {
      subject: i18n.t('backend:email.system_invite.subject', { lng, appName, ...plainText }),
      previewText: i18n.t('backend:email.system_invite.preview', { appName, lng, ...plainText }),
      headerHtml: i18n.t('backend:email.system_invite.title', { appName, lng }),
      hiText: i18n.t('backend:email.hi', { lng, name: param('name'), ...plainText }),
      bodyHtml: i18n.t('backend:email.system_invite.text', { lng, appName, senderName }),
      inviteExpires: i18n.t('backend:email.invite_expires', { lng }),
      buttonText: i18n.t('c:join', { lng }),
      supportText: i18n.t('backend:email.support_email', { lng }),
      senderName,
    };
  },
  component({ previewText, headerHtml, hiText, bodyHtml, inviteExpires, buttonText, supportText, senderName, inviteLink }) {
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
  preview: { statics: { senderName: 'John' }, recipient: { name: 'Emily', inviteLink: 'https://example.com/invite' } },
});
