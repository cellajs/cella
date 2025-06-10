import { onlineManager } from '@tanstack/react-query';
import { t } from 'i18next';
import AttachmentsCarousel, { type CarouselItemData } from '~/modules/attachments/attachments-carousel';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { toaster } from '~/modules/common/toaster';

interface OpenAttachmentDialogParams {
  attachmentIndex: number;
  attachments: CarouselItemData[];
  triggerRef?: React.RefObject<HTMLButtonElement | null>;
}

export const openAttachmentDialog = ({ attachmentIndex, attachments, triggerRef }: OpenAttachmentDialogParams) => {
  if (!onlineManager.isOnline()) return toaster(t('common:action.offline.text'), 'warning');

  useDialoger.getState().create(
    <div className="flex flex-wrap relative -z-1 h-screen justify-center p-2 grow">
      <AttachmentsCarousel items={attachments} isDialog itemIndex={attachmentIndex} saveInSearchParams={false} />
    </div>,
    {
      id: 'attachment-dialog',
      triggerRef: triggerRef || { current: document.activeElement instanceof HTMLButtonElement ? document.activeElement : null },
      drawerOnMobile: false,
      className: 'min-w-full h-screen border-0 p-0 rounded-none flex flex-col mt-0',
      headerClassName: 'absolute p-4 w-full backdrop-blur-xs bg-background/50',
      hideClose: true,
    },
  );
};
