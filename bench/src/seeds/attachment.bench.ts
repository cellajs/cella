import type { InsertAttachmentModel } from '#/modules/attachment/attachment-db';
import { mockAttachment } from '#/modules/attachment/attachment-mocks';
import { registerBenchSeed } from '../registry';
import { attachmentId, CORE_ID_VARIANTS, ORG_ID, TENANT_ID, userId } from './ids';

export const TOTAL_ATTACHMENTS = 500;

/**
 * Reference implementation for the fork seed pattern.
 *
 * @see seeds/README.md
 */
export const loadtestAttachment = (index: number): InsertAttachmentModel => ({
  ...mockAttachment(`attachment:loadtest:${index}`),
  id: attachmentId(index),
  tenantId: TENANT_ID,
  name: `Load Test Attachment ${index}`,
  filename: `xbench-file-${index}.pdf`,
  contentType: 'application/pdf',
  size: '1024',
  bucketName: 'attachments',
  originalKey: `uploads/xbench/${attachmentId(index)}/xbench-file-${index}.pdf`,
  organizationId: ORG_ID,
  createdBy: userId(index % 100),
  updatedBy: userId(index % 100),
});

registerBenchSeed({
  table: 'attachments',
  order: 100,
  idVariant: CORE_ID_VARIANTS.attachment,
  rows: ({ now }) =>
    Array.from({ length: TOTAL_ATTACHMENTS }, (_, i) => ({ ...loadtestAttachment(i), createdAt: now, seq: 0 })),
});
