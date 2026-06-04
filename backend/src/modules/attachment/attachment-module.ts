import { registerTag } from '#/core/tag-registry';

registerTag({
  tag: 'attachments',
  kind: 'module',
  parent: 'cella',
  description: `Endpoints for managing file based *attachments* (e.g. images, PDFs, documents) linked to
    entities such as organizations or users. Files are uploaded directly by the client; the API handles
    metadata registration, linking, access, and preview utilities.`,
});
