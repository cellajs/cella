import { useParams, useSearch } from '@tanstack/react-router';
import { memo, useEffect } from 'react';
import router from '~/lib/router';
import AttachmentDialog from '~/modules/attachments/attachment-dialog';
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

    const triggerRef = getTriggerRef(attachmentDialogId) || fallbackContentRef;

    createDialog(<AttachmentDialog key={attachmentDialogId} attachmentId={attachmentDialogId} orgIdOrSlug={orgIdOrSlug} />, {
      id: 'attachment-dialog',
      triggerRef: triggerRef,
      drawerOnMobile: false,
      className: 'min-w-full h-screen border-0 p-0 rounded-none flex flex-col mt-0',
      headerClassName: 'absolute p-4 w-full backdrop-blur-xs bg-background/50',
      hideClose: true,
      onClose: () => {
        // TODO(IMPROVE) find a way to remove a history entry when the sheet is closed. this way perhaps its better
        // for UX to not do a replace here and in the column
        clearAttachmentDialogSearchParams();
      },
    });
  }, [attachmentDialogId, orgIdOrSlug, groupId]);

  // Separate cleanup when `attachmentDialogId` disappears
  useEffect(() => {
    if (attachmentDialogId) return;
    removeDialog('attachment-dialog');
  }, [attachmentDialogId]);

  return null;
});

export default AttachmentDialogHandler;
