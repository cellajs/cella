import { AttachmentsCarousel, type CarouselItemData } from '~/modules/attachment/attachments-carousel';
import { attachmentDialogId, attachmentDialogOptions } from '~/modules/attachment/dialog/params';
import { dialoger, type TriggerRef } from '~/modules/common/dialoger/use-dialoger';
import { fallbackContentRef } from '~/utils/fallback-content-ref';

interface OpenAttachmentDialogParams {
  attachmentIndex: number;
  attachments: CarouselItemData[];
  triggerRef?: TriggerRef;
}

/** Open resolved cloud or blob attachments without URL-driven dialog state or deep linking. */
export function openAttachmentDialog({ attachmentIndex, attachments, triggerRef }: OpenAttachmentDialogParams) {
  dialoger.getState().create(
    <AttachmentsCarousel items={attachments} isDialog itemIndex={attachmentIndex} saveInSearchParams={false} />,
    attachmentDialogOptions({
      id: attachmentDialogId,
      triggerRef: triggerRef ?? fallbackContentRef,
    }),
  );
}
