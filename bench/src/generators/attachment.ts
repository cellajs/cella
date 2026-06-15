/**
 * Load-test attachment generator — creates attachment records for benchmarking.
 * Runs in Node.js (data-setup), not in k6.
 */
import { mockAttachment } from '#/modules/attachment/attachment-mocks';
import type { InsertAttachmentModel } from '#/modules/attachment/attachment-db';
import { ORG_ID, TENANT_ID, attachmentId, userId } from './ids';

/**
 * Generate a load-test attachment record by index.
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
});
