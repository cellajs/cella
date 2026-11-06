import { type EntityRole, hierarchy } from 'shared';
import { EmailMessage } from '../components';
import { i18n, plainText } from '../i18n';
import { invitePreviewText, linkExpiresText, organizationScope, senderEndingFor, senderHtml } from '../shared-texts';
import { defineEmailTemplate, type EmailRecipient } from '../types';

interface MemberInviteWithTokenStatic {
  senderName: string;
  /** The inviter's address, which replies reach; shown beside the name. */
  senderEmail?: string;
  entityName: string;
  organizationName?: string;
  role: EntityRole;
}

type MemberInviteWithTokenRecipient = EmailRecipient & { inviteLink: string };

const previewStatics: MemberInviteWithTokenStatic = {
  senderName: 'John Doe',
  senderEmail: 'john.doe@acme.example',
  entityName: 'Acme',
  role: hierarchy.getLeastPrivilegedRole('organization'),
};
const previewRecipient = { inviteLink: 'https://example.com/invite' };

/** For an address without an account, which needs the token and is greeted by no name; an account gets member-invite. */
export const memberInviteWithTokenEmail = defineEmailTemplate<MemberInviteWithTokenStatic, MemberInviteWithTokenRecipient>()({
  translate(lng, { senderName, senderEmail, entityName, organizationName, role }) {
    const scope = organizationScope(organizationName);
    return {
      subject: i18n.t(`backend:email.member_invite.subject${scope}`, { lng, senderName, entityName, organizationName, ...plainText }),
      previewText: invitePreviewText(lng),
      headerHtml: i18n.t('backend:email.member_invite.title', { lng, entityName }),
      bodyHtml: i18n.t(`backend:email.member_invite.text${scope}`, {
        lng,
        entityName,
        organizationName,
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
  preview: { statics: previewStatics, recipient: previewRecipient },
  previewVariants: {
    'in-organization': { statics: { ...previewStatics, entityName: 'Website', organizationName: 'Acme' }, recipient: previewRecipient },
  },
});
