import { useParams, useSearch } from '@tanstack/react-router';
import { memo, useEffect } from 'react';
import { attachmentStorage } from '~/modules/attachment/dexie/storage-service';
import AttachmentDialog from '~/modules/attachment/dialog';
import { clearAttachmentDialogSearchParams } from '~/modules/attachment/dialog/lib';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { fallbackContentRef } from '~/utils/fallback-content-ref';

function AttachmentDialogHandlerBase() {
  const { attachmentDialogId, groupId } = useSearch({ strict: false });
  const { orgIdOrSlug: baseOrgIdOrSlug, idOrSlug } = useParams({ strict: false });
  const orgIdOrSlug = baseOrgIdOrSlug || idOrSlug;

  const { remove: removeDialog, create: createDialog, get: getDialog, getTriggerRef } = useDialoger();

  useEffect(() => {
    if (!attachmentDialogId || !orgIdOrSlug) return;
    if (getDialog('attachment-dialog')) return;

    const loadAndCreateDialog = async () => {
      const cachedAttachments = await attachmentStorage.getCachedImages(attachmentDialogId, groupId);

      const validAttachments = cachedAttachments.map((cache) => ({
        id: cache.id,
        url: URL.createObjectURL(cache.file),
      }));

      const dialogTrigger = getTriggerRef(attachmentDialogId);
      const triggerRef = dialogTrigger || fallbackContentRef;

      createDialog(
        <AttachmentDialog key={attachmentDialogId} attachmentId={attachmentDialogId} attachments={validAttachments} />,
        {
          id: 'attachment-dialog',
          triggerRef,
          drawerOnMobile: false,
          className: 'min-w-full h-screen border-0 p-0 rounded-none flex flex-col mt-0',
          headerClassName: 'absolute p-4 w-full backdrop-blur-xs bg-background/50',
          showCloseButton: false,
          onClose: (isCleanup) => {
            if (!isCleanup && dialogTrigger) return history.back();
            clearAttachmentDialogSearchParams();
          },
        },
      );
    };

    loadAndCreateDialog();
  }, [attachmentDialogId, orgIdOrSlug, groupId]);

  // Separate cleanup when `attachmentDialogId` disappears
  useEffect(() => {
    if (attachmentDialogId) return;
    removeDialog(attachmentDialogId, { isCleanup: true });
  }, [attachmentDialogId]);

  return null;
}

const AttachmentDialogHandler = memo(AttachmentDialogHandlerBase);

export default AttachmentDialogHandler;
