import { appConfig } from 'shared';
import { EmailMessage } from '../components';
import { i18n, plainText } from '../i18n';
import { linkExpiresText, senderEndingFor, senderHtml } from '../shared-texts';
import { defineEmailTemplate, type EmailRecipient, plainParam } from '../types';

interface SystemInviteStatic {
  senderName: string;
  /** The inviter's address, which replies reach; shown beside the name. */
  senderEmail?: string;
}

type SystemInviteRecipient = EmailRecipient & { name: string; inviteLink: string };

const appName = appConfig.name;

/** System-level invitation, for new users. */
export const systemInviteEmail = defineEmailTemplate<SystemInviteStatic, SystemInviteRecipient>()({
  translate(lng, { senderName, senderEmail }, param = plainParam) {
    return {
      subject: i18n.t('backend:email.system_invite.subject', { lng, senderName, appName, ...plainText }),
      previewText: i18n.t('backend:email.system_invite.preview', { appName, lng, ...plainText }),
      headerHtml: i18n.t('backend:email.system_invite.title', { appName, lng }),
      hiText: i18n.t('backend:email.hi', { lng, name: param('name'), ...plainText }),
      bodyHtml: i18n.t('backend:email.system_invite.text', { lng, appName, sender: senderHtml(lng, senderName, senderEmail) }),
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
    statics: { senderName: 'John Doe', senderEmail: 'john.doe@acme.example' },
    recipient: { name: 'Emily', inviteLink: 'https://example.com/invite' },
  },
});
