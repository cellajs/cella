import { useParams, useSearch } from '@tanstack/react-router';
import { memo, useEffect } from 'react';
import AttachmentDialog from '~/modules/attachments/dialog';
import { clearAttachmentDialogSearchParams } from '~/modules/attachments/dialog/clear-search-params';
import { LocalFileStorage } from '~/modules/attachments/helpers/local-file-storage';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { fallbackContentRef } from '~/utils/fallback-content-ref';

const AttachmentDialogHandler = memo(() => {
  const { attachmentDialogId, groupId } = useSearch({ strict: false });
  const { orgIdOrSlug: baseOrgIdOrSlug, idOrSlug } = useParams({ strict: false });
  const orgIdOrSlug = baseOrgIdOrSlug || idOrSlug;

  const { remove: removeDialog, create: createDialog, get: getDialog, getTriggerRef } = useDialoger();

  useEffect(() => {
    if (!attachmentDialogId || !orgIdOrSlug) return;
    if (getDialog('attachment-dialog')) return;

    const loadAndCreateDialog = async () => {
      const file = await LocalFileStorage.getFile(attachmentDialogId);
      const dialogTrigger = getTriggerRef(attachmentDialogId);
      const triggerRef = dialogTrigger || fallbackContentRef;

      createDialog(<AttachmentDialog key={attachmentDialogId} attachmentId={attachmentDialogId} orgIdOrSlug={orgIdOrSlug} localAttachment={file} />, {
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
      });
    };

    loadAndCreateDialog();
  }, [attachmentDialogId, orgIdOrSlug, groupId]);

  // Separate cleanup when `attachmentDialogId` disappears
  useEffect(() => {
    if (attachmentDialogId) return;
    removeDialog(attachmentDialogId, { isCleanup: true });
  }, [attachmentDialogId]);

  return null;
});

export default AttachmentDialogHandler;
