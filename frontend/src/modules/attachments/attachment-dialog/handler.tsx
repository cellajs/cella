import { useParams, useSearch } from '@tanstack/react-router';
import { Suspense, memo, useEffect } from 'react';
import router from '~/lib/router';
import AttachmentDialog from '~/modules/attachments/attachment-dialog';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';

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
      dialogContext: undefined,
    }),
  });
};

const AttachmentDialogHandler = memo(() => {
  const { attachmentDialogId, groupId, dialogContext } = useSearch({ strict: false });
  const { orgIdOrSlug: baseOrgIdOrSlug, idOrSlug } = useParams({ strict: false });
  const orgIdOrSlug = baseOrgIdOrSlug || idOrSlug;

  const dialog = useDialoger();

  useEffect(() => {
    if (!attachmentDialogId || !orgIdOrSlug || !dialogContext) return;
    if (dialog.get('attachment-dialog')) return;

    const timeoutId = setTimeout(() => {
      dialog.create(
        <Suspense>
          <AttachmentDialog attachmentId={attachmentDialogId} groupId={groupId} orgIdOrSlug={orgIdOrSlug} />
        </Suspense>,
        {
          id: 'attachment-dialog',
          triggerRef: { current: null },
          drawerOnMobile: false,
          className: 'min-w-full h-screen border-0 p-0 rounded-none flex flex-col mt-0',
          headerClassName: 'absolute p-4 w-full backdrop-blur-xs bg-background/50',
          hideClose: true,
          removeCallback: () => {
            // TODO find a way to remove a history entry when the sheet is closed. this way perhaps its better
            // for UX to not do a replace here and in the column
            clearAttachmentDialogSearchParams();

            // Try to return focus back to the cell
            setTimeout(() => {
              const cell = document.getElementById(`${dialogContext}-${attachmentDialogId}`);
              if (cell) cell.focus();
            }, 0);
          },
        },
      );
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [attachmentDialogId, orgIdOrSlug, dialogContext, groupId]);

  // Separate cleanup when `attachmentDialogId` disappears
  useEffect(() => {
    if (attachmentDialogId) return;
    dialog.remove('attachment-dialog');
  }, [attachmentDialogId]);

  return null;
});

export default AttachmentDialogHandler;
