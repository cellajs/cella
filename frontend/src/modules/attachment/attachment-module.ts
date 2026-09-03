import { defineFrontendModule } from '~/lib/module';

defineFrontendModule({
  name: 'attachments',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description: 'UI for managing file attachments, images, PDFs, and documents linked to entities.',
  // The description is edited through CollaborativeBlockNote; attachment-module (backend) registers the yjsMaterializer.
  collaborativeProduct: 'attachment',
});
