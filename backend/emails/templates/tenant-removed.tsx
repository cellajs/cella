import type { DeliveryNoteStatic } from '../chat-text';
import { EmailLayout, EmailText } from '../components';
import { formatMailTime } from '../frame';
import { i18n, plainText } from '../i18n';
import { defineEmailTemplate } from '../types';

interface TenantRemovedStatic extends DeliveryNoteStatic {
  tenantId: string;
  tenantName: string;
  /** ISO moments of the deletion (a demo's expiry) and of the removal. */
  deletedAt: string;
  removedAt: string;
  /** What the removal deleted, one line per kind, e.g. `attachment: 12`. */
  counts: string[];
}

/** The record of a removal, one line each: the mail lists them and the chat text quotes them. */
const recordLines = (lng: string, { tenantId, deletedAt, removedAt, counts }: TenantRemovedStatic) => [
  `Tenant: ${tenantId}`,
  `Deleted: ${formatMailTime(deletedAt, lng)}`,
  `Removed: ${formatMailTime(removedAt, lng)}, with its organization and the stored files it held. Backups expire on their own schedule.`,
  ...counts,
];

/** Tells the operator a tenant was removed after its deleted-tenant period: the written record of a destruction. */
export const tenantRemovedEmail = defineEmailTemplate<TenantRemovedStatic>()({
  translate(lng, statics) {
    const subject = i18n.t('backend:email.tenant_removed.title', { name: statics.tenantName, lng, ...plainText });
    return {
      subject,
      previewText: subject,
      headerHtml: i18n.t('backend:email.tenant_removed.title', { name: statics.tenantName, lng }),
      supportText: i18n.t('backend:email.support_email', { lng }),
      lines: recordLines(lng, statics),
      endingHtml: statics.deliveryNote,
    };
  },
  component({ previewText, headerHtml, supportText, lines, endingHtml, frame }) {
    return (
      <EmailLayout frame={frame} previewText={previewText} headerHtml={headerHtml} supportText={supportText} endingHtml={endingHtml}>
        {lines.map((line) => (
          <EmailText key={line}>{line}</EmailText>
        ))}
      </EmailLayout>
    );
  },
  chat(lng, statics) {
    return {
      headlineHtml: i18n.t('backend:chat.tenant_removed', { name: statics.tenantName, lng }),
      quote: recordLines(lng, statics).join('\n'),
    };
  },
  preview: {
    statics: {
      tenantId: 'abc123',
      tenantName: 'Example School',
      deletedAt: '2026-06-01T10:00:00.000Z',
      removedAt: '2026-09-29T03:00:00.000Z',
      counts: ['members: 42', 'attachment: 310'],
    },
    recipient: {},
  },
});
