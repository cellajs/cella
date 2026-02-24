import { useMatch, useNavigate, useSearch } from '@tanstack/react-router';
import { memo, useEffect } from 'react';
import { AttachmentDialog } from '~/modules/attachment/dialog';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { fallbackContentRef } from '~/utils/fallback-content-ref';

const searchParamKey = 'attachmentDialogId';
const additionalKeys = ['groupId'];
const dialogId = searchParamKey;

/**
 * Handles opening/closing the attachment dialog based on URL search params.
 * Uses a stable dialog ID so carousel navigation doesn't recreate the dialog.
 */
function AttachmentDialogHandlerBase() {
  const navigate = useNavigate();
  const searchParams = useSearch({ strict: false }) as Record<string, string | undefined>;
  const orgMatch = useMatch({ from: '/appLayout/$tenantId/$orgSlug', shouldThrow: false });
  const orgId = orgMatch?.context?.organization?.id;
  const isOpen = !!searchParams[searchParamKey];

  useEffect(() => {
    if (!isOpen) return;
    if (useDialoger.getState().get(dialogId)) return;

    const close = () => {
      navigate({
        to: '.',
        replace: true,
        resetScroll: false,
        search: (prev) => {
          const next: Record<string, unknown> = { ...prev };
          for (const key of [searchParamKey, ...additionalKeys]) next[key] = undefined;
          return next;
        },
      });
    };

    queueMicrotask(() => {
      useDialoger.getState().create(<AttachmentDialog />, {
        id: dialogId,
        triggerRef: fallbackContentRef,
        onClose: (isCleanup?: boolean) => {
          if (!isCleanup) close();
        },
        drawerOnMobile: false,
        className: 'min-w-full h-screen border-0 p-0 rounded-none flex flex-col mt-0',
        headerClassName: 'absolute p-4 w-full backdrop-blur-xs bg-background/50',
        showCloseButton: false,
      });
    });

    return () => {
      useDialoger.getState().remove(dialogId, { isCleanup: true });
    };
  }, [isOpen, orgId]);

  return null;
}

export const AttachmentDialogHandler = memo(AttachmentDialogHandlerBase);
