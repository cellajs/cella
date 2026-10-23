import { PaperclipIcon } from 'lucide-react';
import { defineFrontendModule } from '~/lib/module';
import { attachmentDialogParam } from '~/modules/attachment/dialog/params';
// Registers the mutation defaults before the cache restore, so a queued attachment mutation replays after a reload
import '~/modules/attachment/query';

defineFrontendModule({
  name: 'attachments',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description: 'UI for managing file attachments, images, PDFs, and documents linked to entities.',
  // Which products get a per-member stat column comes from `appConfig.memberStatProductTypes`; the icon is this module's.
  // `deepLinkParam` is the one this module's `attachmentsRouteSearchParamsSchema` declares, so a notification opens the dialog.
  product: { entityType: 'attachment', memberStatIcon: PaperclipIcon, deepLinkParam: attachmentDialogParam },
});
