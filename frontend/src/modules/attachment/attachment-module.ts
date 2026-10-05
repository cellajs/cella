import { PaperclipIcon } from 'lucide-react';
import { defineFrontendModule } from '~/lib/module';
import { ATTACHMENT_DIALOG_PARAM } from '~/modules/attachment/dialog/params';

defineFrontendModule({
  name: 'attachments',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description: 'UI for managing file attachments, images, PDFs, and documents linked to entities.',
  // Which products get a per-member stat column comes from `appConfig.memberStatProductTypes`; the icon is this module's.
  // `deepLinkParam` is the one this module's `attachmentsRouteSearchParamsSchema` declares, so a notification opens the dialog.
  product: { entityType: 'attachment', memberStatIcon: PaperclipIcon, deepLinkParam: ATTACHMENT_DIALOG_PARAM },
});
