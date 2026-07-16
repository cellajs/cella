import { AttachmentsCarousel, type CarouselItemData } from '~/modules/attachment/attachments-carousel';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { getRouter } from '~/routes/_router-instance';

interface OpenAttachmentDialogParams {
  attachmentIndex: number;
  attachments: CarouselItemData[];
  triggerRef?: React.RefObject<HTMLButtonElement | null>;
}

/**
 * Opens an attachment dialog with carousel.
 * Works with both cloud and local blob URLs.
 */
export const openAttachmentDialog = ({ attachmentIndex, attachments, triggerRef }: OpenAttachmentDialogParams) => {
  useDialoger.getState().create(
    <div className="relative -z-1 flex h-screen grow flex-wrap justify-center p-2">
      <AttachmentsCarousel items={attachments} isDialog itemIndex={attachmentIndex} saveInSearchParams={false} />
    </div>,
    {
      id: 'attachment-dialog',
      triggerRef: triggerRef || {
        current: document.activeElement instanceof HTMLButtonElement ? document.activeElement : null,
      },
      drawerOnMobile: false,
      className: 'min-w-full h-dvh max-h-dvh border-0 p-0 rounded-none flex flex-col mt-0',
      headerClassName: 'absolute p-4 w-full backdrop-blur-xs bg-background/50',
    },
  );
};

/**
 * Handler for attachment dialog.
 * It creates and removes an attachment dialog by listening to `attachmentDialogId` in search parameters.
 */
export const clearAttachmentDialogSearchParams = () => {
  // Keep this on the router instance rather than `useNavigate()`: `to: '.'` resolves against the
  // current location here, where a hook would resolve it against the calling component's match.
  getRouter().navigate({
    to: '.',
    replace: true,
    resetScroll: false,
    search: (prev) => ({
      ...prev,
      attachmentDialogId: undefined,
      groupId: undefined,
    }),
  });
};
