import { PaperclipIcon } from 'lucide-react';
import { defineFrontendModule } from '~/lib/module';

defineFrontendModule({
  name: 'attachments',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description: 'UI for managing file attachments, images, PDFs, and documents linked to entities.',
  // Which products get a per-member stat column comes from `appConfig.memberStatProductTypes`; the icon is this module's.
  product: { entityType: 'attachment', memberStatIcon: PaperclipIcon },
});
