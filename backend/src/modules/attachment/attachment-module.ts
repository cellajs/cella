import { defineBackendModule } from '#/lib/module';
import { attachmentHandlers } from '#/modules/attachment/attachment-handlers';
import { updateAttachmentOp } from '#/modules/attachment/operations/update-attachment';

defineBackendModule({
  name: 'attachments',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description: `Endpoints for managing file based attachments (such as images, PDFs, and documents) in an
    organization or one of its channels. Files are uploaded directly by the client, while the API registers their
    metadata, links the stored files and signs download URLs. The description is edited collaboratively and is a
    notification source for mentions.`,
  productEntity: 'attachment',
  yjsMaterializer: updateAttachmentOp,
  notifications: true,
  routes: [{ path: '/:tenantId/:organizationId/attachments', app: attachmentHandlers, phase: 'tenant' }],
});
