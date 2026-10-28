import { type EntityRole, hierarchy } from 'shared';
import { EmailMessage } from '../components';
import { i18n, plainText } from '../i18n';
import { senderEndingFor, senderHtml } from '../shared-texts';
import { defineEmailTemplate, type EmailRecipient, plainParam } from '../types';

interface MemberAddedStatic {
  senderName: string;
  /** The address of whoever added the member, which replies reach; shown beside the name. */
  senderEmail?: string;
  entityName: string;
  role: EntityRole;
}

type MemberAddedRecipient = EmailRecipient & { name: string; entityLink: string };

export const memberAddedEmail = defineEmailTemplate<MemberAddedStatic, MemberAddedRecipient>()({
  translate(lng, { senderName, senderEmail, entityName, role }, param = plainParam) {
    return {
      subject: i18n.t('backend:email.member_added.subject', { lng, senderName, entityName, ...plainText }),
      previewText: i18n.t('backend:email.member_added.preview', { lng, entityName, ...plainText }),
      headerHtml: i18n.t('backend:email.member_added.title', { lng, entityName }),
      hiText: i18n.t('backend:email.hi', { lng, name: param('name'), ...plainText }),
      bodyHtml: i18n.t('backend:email.member_added.text', {
        lng,
        entityName,
        sender: senderHtml(lng, senderName, senderEmail),
        role: i18n.t(`c:${role}`, { lng }),
      }),
      buttonText: i18n.t('c:view', { lng }),
      endingHtml: senderEndingFor(lng, { senderName, senderEmail, ignorable: false }),
      supportText: i18n.t('backend:email.support_email', { lng }),
      senderName,
    };
  },
  component({ previewText, headerHtml, hiText, bodyHtml, buttonText, endingHtml, supportText, senderName, entityLink, frame }) {
    return (
      <EmailMessage
        frame={frame}
        previewText={previewText}
        avatarName={senderName}
        headerHtml={headerHtml}
        greeting={hiText}
        bodyHtml={bodyHtml}
        action={{ label: buttonText, href: entityLink }}
        endingHtml={endingHtml || undefined}
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
    recipient: { name: 'Emily', entityLink: 'https://example.com/acme' },
  },
});
