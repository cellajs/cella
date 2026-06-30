import { registerModule } from 'shared/module-registry';

registerModule({
  name: 'attachments',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description: `Endpoints for managing file based attachments (e.g. images, PDFs, documents) linked to
    entities such as organizations or users. Files are uploaded directly by the client; the API handles
    metadata registration, linking, access, and preview utilities.`,
});
