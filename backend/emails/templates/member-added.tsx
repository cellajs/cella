import { appConfig, type EntityRole, hierarchy } from 'shared';
import { EmailMessage } from '../components';
import { i18n, plainText } from '../i18n';
import { defineEmailTemplate, type EmailRecipient, plainParam } from '../types';

interface MemberAddedStatic {
  senderName: string;
  entityName: string;
  role: EntityRole;
}

type MemberAddedRecipient = EmailRecipient & { name: string; entityLink: string };

const appName = appConfig.name;

export const memberAddedEmail = defineEmailTemplate<MemberAddedStatic, MemberAddedRecipient>()({
  translate(lng, { senderName, entityName, role }, param = plainParam) {
    return {
      subject: i18n.t('backend:email.member_added.subject', { lng, entityName, ...plainText }),
      previewText: i18n.t('backend:email.member_added.preview', { lng, entityName, appName, ...plainText }),
      headerHtml: i18n.t('backend:email.member_added.title', { lng, entityName }),
      hiText: i18n.t('backend:email.hi', { lng, name: param('name'), ...plainText }),
      bodyHtml: i18n.t('backend:email.member_added.text', { lng, entityName, appName, senderName, role }),
      buttonText: i18n.t('c:view', { lng }),
      supportText: i18n.t('backend:email.support_email', { lng }),
      senderName,
    };
  },
  component({ previewText, headerHtml, hiText, bodyHtml, buttonText, supportText, senderName, entityLink }) {
    return (
      <EmailMessage
        previewText={previewText}
        avatarName={senderName}
        headerHtml={headerHtml}
        greeting={hiText}
        bodyHtml={bodyHtml}
        action={{ label: buttonText, href: entityLink }}
        supportText={supportText}
      />
    );
  },
  preview: {
    statics: { senderName: 'John', entityName: 'Acme', role: hierarchy.getLeastPrivilegedRole('organization') },
    recipient: { name: 'Emily', entityLink: 'https://example.com/acme' },
  },
});
