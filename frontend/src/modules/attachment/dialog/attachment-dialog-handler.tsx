import { useMatch, useNavigate, useSearch } from '@tanstack/react-router';
import { useEffect } from 'react';
import { AttachmentDialog } from '~/modules/attachment/dialog/attachment-dialog';
import {
  attachmentDialogOptions,
  attachmentDialogParam,
  attachmentUrlDialogId,
  clearAttachmentDialogSearch,
} from '~/modules/attachment/dialog/params';
import { dialoger } from '~/modules/common/dialoger/use-dialoger';
import { fallbackContentRef } from '~/utils/fallback-content-ref';

/** Mounted once in the app layout: opens the viewer while the URL holds an attachment id, and clears the id on close. */
export function AttachmentDialogHandler() {
  const navigate = useNavigate();
  const isOpen = useSearch({ strict: false, select: (s) => !!s[attachmentDialogParam] });
  const organizationId = useMatch({ from: '/_app/$tenantId/$organizationSlug', shouldThrow: false, select: (m) => m.context.organization?.id });

  useEffect(() => {
    if (!isOpen) return;
    if (dialoger.getState().get(attachmentUrlDialogId)) return;

    const close = () => {
      navigate({ to: '.', replace: true, resetScroll: false, search: clearAttachmentDialogSearch });
    };

    queueMicrotask(() => {
      dialoger.getState().create(
        <AttachmentDialog />,
        attachmentDialogOptions({
          id: attachmentUrlDialogId,
          triggerRef: fallbackContentRef,
          onClose: (isCleanup) => {
            if (!isCleanup) close();
          },
          // Open state lives in the URL: remove on ESC/outside-press so the search param clears before a re-open can flash.
          instantClose: true,
        }),
      );
    });

    return () => {
      dialoger.getState().remove(attachmentUrlDialogId, { isCleanup: true });
    };
  }, [isOpen, organizationId]);

  return null;
}
