import { defineBackendModule } from '#/lib/module';
import { attachmentHandlers } from './attachment-handlers';
import { purgeDeletedAttachmentFiles, purgeOrganizationFiles } from './operations/purge-files';
import { updateAttachmentOp } from './operations/update-attachment';

defineBackendModule({
  name: 'attachments',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description: `Endpoints for managing file based attachments (such as images, PDFs, and documents) linked to
    entities such as organizations or users. Files are uploaded directly by the client, while the API handles
    metadata registration, linking, access, and preview utilities. The description is edited collaboratively
    and is a notification source for mentions.`,
  productEntity: 'attachment',
  yjsMaterializer: updateAttachmentOp,
  notifications: true,
  // Hourly; the three-quarter offset keeps it clear of the digest and OIDC sweep ticks.
  jobs: [{ name: 'attachment-files-purge', cron: '45 * * * *', run: () => purgeDeletedAttachmentFiles() }],
  onMutation: {
    // Not awaited: listing and deleting a large organization's files would hold the request.
    'organization.deleted': async (_ctx, { before = [] }) => {
      void purgeOrganizationFiles(before.flatMap((row) => (typeof row.id === 'string' ? [row.id] : [])));
    },
  },
  routes: [{ path: '/:tenantId/:organizationId/attachments', app: attachmentHandlers, phase: 'tenant' }],
});
