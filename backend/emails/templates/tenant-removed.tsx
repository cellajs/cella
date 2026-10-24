import { appConfig } from 'shared';
import { EmailLayout, EmailText } from '../components';
import { i18n } from '../i18n';
import { defineEmailTemplate } from '../types';

interface TenantRemovedStatic {
  tenantId: string;
  tenantName: string;
  /** ISO moments of the archiving and of the removal. */
  archivedAt: string;
  removedAt: string;
  /** What the removal deleted, one line per kind, e.g. `attachment: 12`. */
  counts: string[];
}

/** Tells the operator a tenant was removed after its archived period: the written record of a destruction. */
export const tenantRemovedEmail = defineEmailTemplate<TenantRemovedStatic>()({
  translate(lng, statics) {
    return {
      subject: i18n.t('backend:email.tenant_removed.title', { appName: appConfig.name, name: statics.tenantName, lng }),
      headerHtml: i18n.t('backend:email.tenant_removed.title', { appName: appConfig.name, name: statics.tenantName, lng }),
      supportText: i18n.t('backend:email.support_email', { lng }),
      ...statics,
    };
  },
  component({ subject, headerHtml, supportText, tenantId, archivedAt, removedAt, counts }) {
    return (
      <EmailLayout previewText={subject} headerHtml={headerHtml} supportText={supportText}>
        <EmailText>Tenant: {tenantId}</EmailText>
        <EmailText>Archived: {archivedAt}</EmailText>
        <EmailText>Removed: {removedAt}, with its organization and the stored files it held. Backups expire on their own schedule.</EmailText>
        {counts.map((line) => (
          <EmailText key={line}>{line}</EmailText>
        ))}
      </EmailLayout>
    );
  },
  preview: {
    statics: {
      tenantId: 'abc123',
      tenantName: 'Example School',
      archivedAt: '2026-06-01T10:00:00.000Z',
      removedAt: '2026-09-29T03:00:00.000Z',
      counts: ['members: 42', 'attachment: 310'],
    },
    recipient: {},
  },
});
