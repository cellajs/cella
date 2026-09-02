import { defineBackendModule } from '#/lib/module';
import { attachmentHandlers } from './attachment-handlers';

defineBackendModule({
  name: 'attachments',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description: `Endpoints for managing file based attachments (such as images, PDFs, and documents) linked to
    entities such as organizations or users. Files are uploaded directly by the client, while the API handles
    metadata registration, linking, access, and preview utilities.`,
  routes: [{ path: '/:tenantId/:organizationId/attachments', app: attachmentHandlers, phase: 'tenant' }],
});
