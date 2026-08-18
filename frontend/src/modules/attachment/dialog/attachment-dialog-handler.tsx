import { useMatch, useNavigate, useSearch } from '@tanstack/react-router';
import { memo, useEffect } from 'react';
import { AttachmentDialog } from '~/modules/attachment/dialog/attachment-dialog';
import {
  ATTACHMENT_DIALOG_PARAM,
  attachmentDialogOptions,
  clearAttachmentDialogSearch,
} from '~/modules/attachment/dialog/params';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { fallbackContentRef } from '~/utils/fallback-content-ref';

const dialogId = ATTACHMENT_DIALOG_PARAM;

/** A stable dialog id keeps carousel navigation from recreating the dialog. */
function AttachmentDialogHandlerBase() {
  const navigate = useNavigate();
  const searchParams = useSearch({ strict: false }) as Record<string, string | undefined>;
  const orgMatch = useMatch({ from: '/_app/$tenantId/$organizationSlug', shouldThrow: false });
  const organizationId = orgMatch?.context?.organization?.id;
  const isOpen = !!searchParams[ATTACHMENT_DIALOG_PARAM];

  useEffect(() => {
    if (!isOpen) return;
    if (useDialoger.getState().get(dialogId)) return;

    const close = () => {
      navigate({ to: '.', replace: true, resetScroll: false, search: clearAttachmentDialogSearch });
    };

    queueMicrotask(() => {
      useDialoger.getState().create(
        <AttachmentDialog />,
        attachmentDialogOptions({
          id: dialogId,
          triggerRef: fallbackContentRef,
          onClose: (isCleanup?: boolean) => {
            if (!isCleanup) close();
          },
          // Open state lives in the URL: remove on ESC/outside-press so the search param clears before a re-open can flash.
          instantClose: true,
          headerClassName: 'hidden',
        }),
      );
    });

    return () => {
      useDialoger.getState().remove(dialogId, { isCleanup: true });
    };
  }, [isOpen, organizationId]);

  return null;
}

export const AttachmentDialogHandler = memo(AttachmentDialogHandlerBase);
