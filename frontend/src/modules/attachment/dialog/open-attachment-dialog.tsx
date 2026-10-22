import { AttachmentsCarousel, type CarouselItemData } from '~/modules/attachment/attachments-carousel';
import { attachmentDialogContentClassName, attachmentDialogOptions } from '~/modules/attachment/dialog/params';
import { dialoger, type TriggerRef } from '~/modules/common/dialoger/use-dialoger';
import { fallbackContentRef } from '~/utils/fallback-content-ref';

interface OpenAttachmentDialogParams {
  attachmentIndex: number;
  attachments: CarouselItemData[];
  triggerRef?: TriggerRef;
}

/** Open resolved cloud or blob attachments without URL-driven dialog state or deep linking. */
export const openAttachmentDialog = ({ attachmentIndex, attachments, triggerRef }: OpenAttachmentDialogParams) => {
  dialoger.getState().create(
    <div className={attachmentDialogContentClassName}>
      <AttachmentsCarousel items={attachments} isDialog itemIndex={attachmentIndex} saveInSearchParams={false} />
    </div>,
    attachmentDialogOptions({
      id: 'attachment-dialog',
      triggerRef: triggerRef ?? fallbackContentRef,
    }),
  );
};
