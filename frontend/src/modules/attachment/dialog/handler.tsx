import { memo } from 'react';
import { useUrlDialog } from '~/hooks/use-url-overlay';
import { AttachmentDialog } from '~/modules/attachment/dialog';

/**
 * Handles opening/closing the attachment dialog based on URL search params.
 * Pure lifecycle manager - dialog content reads URL internally for reactivity.
 */
function AttachmentDialogHandlerBase() {
  useUrlDialog({
    searchParamKey: 'attachmentDialogId',
    additionalSearchParamKeys: ['groupId'],
    renderContent: () => <AttachmentDialog />,
    options: {
      drawerOnMobile: false,
      className: 'min-w-full h-screen border-0 p-0 rounded-none flex flex-col mt-0',
      headerClassName: 'absolute p-4 w-full backdrop-blur-xs bg-background/50',
      showCloseButton: false,
    },
  });

  return null;
}

export const AttachmentDialogHandler = memo(AttachmentDialogHandlerBase);
