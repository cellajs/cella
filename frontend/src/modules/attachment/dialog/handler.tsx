import { memo } from 'react';
import { useUrlSheet } from '~/hooks/use-url-sheet';
import { attachmentStorage } from '~/modules/attachment/dexie/storage-service';
import AttachmentDialog from '~/modules/attachment/dialog';

// Store blob URLs to pass to renderContent (since onBeforeCreate runs before render)
const blobUrlCache = new Map<string, string>();

/**
 * Handles opening/closing the attachment dialog based on URL search params.
 * Listens to `attachmentDialogId` in search params and manages the dialog lifecycle.
 */
function AttachmentDialogHandlerBase() {
  useUrlSheet({
    searchParamKey: 'attachmentDialogId',
    additionalSearchParamKeys: ['groupId'],
    type: 'dialog',
    instanceId: 'attachment-dialog',
    requireOrgContext: true,
    onBeforeCreate: async (id) => {
      // Try to get local blob URL first
      const blobUrl = await attachmentStorage.createBlobUrl(id);
      if (blobUrl) {
        blobUrlCache.set(id, blobUrl);
      }
      return {
        cleanup: () => {
          if (blobUrl) {
            URL.revokeObjectURL(blobUrl);
            blobUrlCache.delete(id);
          }
        },
      };
    },
    renderContent: (id) => {
      const blobUrl = blobUrlCache.get(id);
      // If we have a local blob, use it; otherwise this attachment may not be cached
      // The AttachmentRender will handle cloud URL resolution via useAttachmentUrl hook
      const validAttachments = blobUrl ? [{ id, url: blobUrl }] : [{ id, url: '' }];

      return <AttachmentDialog key={id} attachmentId={id} attachments={validAttachments} />;
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
