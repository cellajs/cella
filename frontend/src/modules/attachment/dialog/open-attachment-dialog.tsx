import { AttachmentsCarousel, type CarouselItemData } from '~/modules/attachment/attachments-carousel';
import { attachmentDialogContentClassName, attachmentDialogOptions } from '~/modules/attachment/dialog/params';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';

interface OpenAttachmentDialogParams {
  attachmentIndex: number;
  attachments: CarouselItemData[];
  triggerRef?: React.RefObject<HTMLButtonElement | null>;
}

/**
 * Open the attachment carousel imperatively, for callers that already hold resolved items
 * (BlockNote media). Unlike the URL-driven `AttachmentDialogHandler`, this dialog is not bound to
 * search params, so it is not deep-linkable and the carousel does not rewrite the URL.
 *
 * Works with both cloud and local blob URLs.
 */
export const openAttachmentDialog = ({ attachmentIndex, attachments, triggerRef }: OpenAttachmentDialogParams) => {
  useDialoger.getState().create(
    <div className={attachmentDialogContentClassName}>
      <AttachmentsCarousel items={attachments} isDialog itemIndex={attachmentIndex} saveInSearchParams={false} />
    </div>,
    attachmentDialogOptions({
      id: 'attachment-dialog',
      triggerRef: triggerRef || {
        current: document.activeElement instanceof HTMLButtonElement ? document.activeElement : null,
      },
      headerClassName: 'absolute p-4 w-full backdrop-blur-xs bg-background/50',
    }),
  );
};
