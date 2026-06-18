/**
 * Load-test attachment seed — self-registers into the bench seed registry.
 *
 * Reference for fork-owned seeds (entities OR resources): copy this file to
 * `seeds/<name>.bench.ts`, point it at your table/mock, and it is seeded and
 * cleaned automatically. Pick an `order` ≥ 100 for fork seeds, and import id/relation
 * helpers from `./ids`.
 *
 * Runs in Node.js (data-setup), not in Artillery scenarios.
 */

import type { InsertAttachmentModel } from '#/modules/attachment/attachment-db';
import { mockAttachment } from '#/modules/attachment/attachment-mocks';
import { registerBenchSeed } from '../registry';
import { attachmentId, ORG_ID, TENANT_ID, TOTAL_ATTACHMENTS, userId } from './ids';

/** Generate a load-test attachment record by index. */
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
  cleanupWhere: `id::text LIKE '00000000-0000-4000-a005%'`,
  rows: ({ now }) =>
    Array.from({ length: TOTAL_ATTACHMENTS }, (_, i) => ({ ...loadtestAttachment(i), createdAt: now, seq: 0 })),
});
