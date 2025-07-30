import { useParams, useSearch } from '@tanstack/react-router';
import { memo, useEffect } from 'react';
import router from '~/lib/router';
import AttachmentDialog from '~/modules/attachments/dialog';
import { LocalFileStorage } from '~/modules/attachments/helpers/local-file-storage';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { fallbackContentRef } from '~/utils/fallback-content-ref';

/**
 * Handler for attachment dialog.
 * It creates and removes an attachment dialog by listening to `attachmentDialogId` in search parameters.
 */
export const clearAttachmentDialogSearchParams = () => {
  router.navigate({
    to: '.',
    replace: true,
    resetScroll: false,
    search: (prev) => ({
      ...prev,
      attachmentDialogId: undefined,
      groupId: undefined,
    }),
  });
};

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
        hideClose: true,
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
