/**
 * Load-test attachment generator — creates attachment records for benchmarking.
 * Runs in Node.js (data-setup), not in k6.
 */
import { mockAttachment } from '../../../backend/mocks/mock-attachment';
import type { InsertAttachmentModel } from '../../../backend/src/db/schema/attachments';
import { ORG_ID, TENANT_ID, TOTAL_PROJECTS, attachmentId, projectId, userId } from './ids';

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
  projectId: projectId(index % TOTAL_PROJECTS),
  createdBy: userId(index % 100),
});
