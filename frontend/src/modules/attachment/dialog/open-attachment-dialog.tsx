import { AttachmentsCarousel, type CarouselItemData } from '~/modules/attachment/attachments-carousel';
import { attachmentDialogContentClassName, attachmentDialogOptions } from '~/modules/attachment/dialog/params';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';

interface OpenAttachmentDialogParams {
  attachmentIndex: number;
  attachments: CarouselItemData[];
  triggerRef?: React.RefObject<HTMLButtonElement | null>;
}

/** Open resolved cloud or blob attachments without URL-driven dialog state or deep linking. */
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
