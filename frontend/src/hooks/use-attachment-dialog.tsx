import { useNavigate } from '@tanstack/react-router';
import { Suspense, useEffect } from 'react';
import AttachmentDialog from '~/modules/attachments/attachment-dialog';
import { isDialog as checkDialog, dialog } from '~/modules/common/dialoger/state';

type AttachmentDialogProps = { attachmentPreview?: string; orgIdOrSlug: string; groupId?: string };

export const useAttachmentDialog = ({ attachmentPreview, groupId, orgIdOrSlug }: AttachmentDialogProps) => {
  const navigate = useNavigate();

  useEffect(() => {
    const targetDialog = dialog.get('attachment-file-preview');
    if (attachmentPreview && (!targetDialog || !checkDialog(targetDialog) || !targetDialog.open)) {
      const timeoutId = setTimeout(() => {
        // Open dialog if it's not already open
        dialog(
          <Suspense>
            <AttachmentDialog attachmentId={attachmentPreview} groupId={groupId} orgIdOrSlug={orgIdOrSlug} />
          </Suspense>,
          {
            id: 'attachment-file-preview',
            drawerOnMobile: false,
            className: 'min-w-full h-screen border-0 p-0 rounded-none flex flex-col mt-0',
            headerClassName: 'absolute p-4 w-full backdrop-blur-xs bg-background/50',
            hideClose: true,
            autoFocus: true,
            removeCallback: () => {
              // Remove `attachmentPreview` from URL only if dialog is closed
              navigate({
                to: '.',
                replace: true,
                resetScroll: false,
                search: (prev) => ({ ...prev, attachmentPreview: undefined, groupId: undefined }),
              });
            },
          },
        );
      }, 0);

      // Skip dialog removal if it's already open
      if (targetDialog && checkDialog(targetDialog) && attachmentPreview) return;

      // Cleanup: Only remove the dialog if no preview exists (i.e., dialog should be closed)
      return () => {
        if (!attachmentPreview) {
          clearTimeout(timeoutId);
          dialog.remove(true, 'attachment-file-preview');
        }
      };
    }
  }, [attachmentPreview]);
};
