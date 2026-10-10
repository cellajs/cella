import { appConfig, hierarchy } from 'shared';
import type { InsertAttachmentModel } from '#/modules/attachment/attachment-db';
import { mockAttachment } from '#/modules/attachment/attachment-mocks';
import { registerBenchSeed } from '../registry';
import { TOTAL_ATTACHMENTS } from './attachment-constants';
import { attachmentSeedOrder, benchAttachmentHome } from './attachment-home';
import { attachmentId, CORE_ID_VARIANTS, ORG_ID, TENANT_ID, userId } from './ids';

/**
 * Reference implementation for the app seed pattern.
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
  keys: { original: `uploads/xbench/${attachmentId(index)}/xbench-file-${index}.pdf` },
  organizationId: ORG_ID,
  // The mock invents ids for every ancestor, and those reference no seeded channel: a nullable one is null unless the app's home names it.
  ...Object.fromEntries(hierarchy.getNullableAncestors('attachment').map((type) => [appConfig.entityIdColumnKeys[type], null])),
  ...benchAttachmentHome(index),
  createdBy: userId(index % 100),
  updatedBy: userId(index % 100),
});

registerBenchSeed({
  table: 'attachments',
  order: attachmentSeedOrder,
  idVariant: CORE_ID_VARIANTS.attachment,
  rows: ({ now }) => Array.from({ length: TOTAL_ATTACHMENTS }, (_, i) => ({ ...loadtestAttachment(i), createdAt: now, seq: 0 })),
});
