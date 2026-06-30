import { registerModule } from 'shared/module-registry';

registerModule({
  name: 'attachments',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description: 'UI for managing file attachments, images, PDFs, and documents linked to entities.',
});
