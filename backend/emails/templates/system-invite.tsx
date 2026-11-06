import { EmailMessage } from '../components';
import { i18n, plainText } from '../i18n';
import { invitePreviewText, linkExpiresText, senderEndingFor, senderHtml } from '../shared-texts';
import { defineEmailTemplate, type EmailRecipient } from '../types';

interface SystemInviteStatic {
  senderName: string;
  /** The inviter's address, which replies reach; shown beside the name. */
  senderEmail?: string;
}

type SystemInviteRecipient = EmailRecipient & { inviteLink: string };

/** System-level invitation, for an address without an account: it greets no one. */
export const systemInviteEmail = defineEmailTemplate<SystemInviteStatic, SystemInviteRecipient>()({
  translate(lng, { senderName, senderEmail }) {
    return {
      subject: i18n.t('backend:email.system_invite.subject', { lng, senderName, ...plainText }),
      previewText: invitePreviewText(lng),
      headerHtml: i18n.t('backend:email.system_invite.title', { lng }),
      bodyHtml: i18n.t('backend:email.system_invite.text', { lng, sender: senderHtml(lng, senderName, senderEmail) }),
      expiresText: linkExpiresText(lng, 'invitation'),
      buttonText: i18n.t('c:join', { lng }),
      endingHtml: senderEndingFor(lng, { senderName, senderEmail, ignorable: true }),
      supportText: i18n.t('backend:email.support_email', { lng }),
      senderName,
    };
  },
  component({ previewText, headerHtml, bodyHtml, expiresText, buttonText, endingHtml, supportText, senderName, inviteLink, frame }) {
    return (
      <EmailMessage
        frame={frame}
        previewText={previewText}
        avatarName={senderName}
        headerHtml={headerHtml}
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
    recipient: { inviteLink: 'https://example.com/invite' },
  },
});
