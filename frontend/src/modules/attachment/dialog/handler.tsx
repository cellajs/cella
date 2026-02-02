import { memo, useEffect, useRef } from 'react';
import { useUrlOverlayState } from '~/hooks/use-url-overlay-state';
import AttachmentDialog from '~/modules/attachment/dialog';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';

const instanceId = 'attachment-dialog';

/**
 * Handles opening/closing the attachment dialog based on URL search params.
 * Pure lifecycle manager - dialog content reads URL internally for reactivity.
 */
function AttachmentDialogHandlerBase() {
  const { isOpen, orgIdOrSlug, triggerRef, close } = useUrlOverlayState('attachmentDialogId', {
    getStore: useDialoger.getState,
    additionalParamKeys: ['groupId'],
  });

  // Keep refs to avoid re-running effect when these change
  const triggerRefRef = useRef(triggerRef);
  const closeRef = useRef(close);
  triggerRefRef.current = triggerRef;
  closeRef.current = close;

  useEffect(() => {
    if (!isOpen || !orgIdOrSlug) return;

    // Skip if dialog already exists
    if (useDialoger.getState().get(instanceId)) return;

    queueMicrotask(() => {
      useDialoger.getState().create(<AttachmentDialog />, {
        id: instanceId,
        triggerRef: triggerRefRef.current,
        onClose: (isCleanup) => closeRef.current(isCleanup),
        drawerOnMobile: false,
        className: 'min-w-full h-screen border-0 p-0 rounded-none flex flex-col mt-0',
        headerClassName: 'absolute p-4 w-full backdrop-blur-xs bg-background/50',
        showCloseButton: false,
      });
    });

    return () => useDialoger.getState().remove(instanceId, { isCleanup: true });
  }, [isOpen, orgIdOrSlug]);

  return null;
}

const AttachmentDialogHandler = memo(AttachmentDialogHandlerBase);

export default AttachmentDialogHandler;
