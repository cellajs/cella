import { memo } from 'react';
import { useUrlSheet } from '~/hooks/use-url-sheet';
import AttachmentDialog from '~/modules/attachment/dialog';

/**
 * Handles opening/closing the attachment dialog based on URL search params.
 * Listens to `attachmentDialogId` in search params and manages the dialog lifecycle.
 * URL resolution is handled by AttachmentDialog via useResolvedAttachments hook.
 */
function AttachmentDialogHandlerBase() {
  useUrlSheet({
    searchParamKey: 'attachmentDialogId',
    additionalSearchParamKeys: ['groupId'],
    type: 'dialog',
    instanceId: 'attachment-dialog',
    requireOrgContext: true,
    renderContent: (id) => {
      // Pass only the ID - AttachmentDialog will resolve the URL
      return <AttachmentDialog key={id} attachmentId={id} attachments={[{ id }]} />;
    },
    options: {
      drawerOnMobile: false,
      className: 'min-w-full h-screen border-0 p-0 rounded-none flex flex-col mt-0',
      headerClassName: 'absolute p-4 w-full backdrop-blur-xs bg-background/50',
      showCloseButton: false,
    },
  });

  return null;
}

const AttachmentDialogHandler = memo(AttachmentDialogHandlerBase);

export default AttachmentDialogHandler;
