import { onlineManager } from '@tanstack/react-query';
import { t } from 'i18next';
import AttachmentsCarousel, { type CarouselItemData } from '~/modules/attachments/carousel';
import { type DialogData, useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { toaster } from '~/modules/common/toaster';

export const openAttachmentDialog = (
  attachmentIndex: number,
  attachments: CarouselItemData[],
  saveInSearchParams = false,
  dialogOptions?: Pick<DialogData, 'removeCallback'>,
) => {
  if (!onlineManager.isOnline()) return toaster(t('common:action.offline.text'), 'warning');

  const { removeCallback } = dialogOptions || {};
  useDialoger.getState().create(
    <div className="flex flex-wrap relative -z-1 h-screen justify-center p-2 grow">
      <AttachmentsCarousel items={attachments} isDialog itemIndex={attachmentIndex} saveInSearchParams={saveInSearchParams} />
    </div>,
    {
      id: 'attachment-dialog',
      // TODO
      triggerRef: { current: null },
      drawerOnMobile: false,
      className: 'min-w-full h-screen border-0 p-0 rounded-none flex flex-col mt-0',
      headerClassName: 'absolute p-4 w-full backdrop-blur-xs bg-background/50',
      hideClose: true,
      removeCallback,
    },
  );
};
