import { onlineManager } from '@tanstack/react-query';
import { t } from 'i18next';
import AttachmentsCarousel from '~/modules/attachments/carousel';
import { type DialogData, useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { toaster } from '~/modules/common/toaster';

export type CarouselAttachment = { url: string; filename?: string; name?: string; contentType?: string };

export const openAttachmentDialog = (
  attachmentIndex: number,
  attachments: CarouselAttachment[],
  saveInSearchParams = false,
  // TODO this is not used anywhere?
  dialogOptions?: Omit<DialogData, 'id'>,
) => {
  if (!onlineManager.isOnline()) return toaster(t('common:action.offline.text'), 'warning');

  const { removeCallback } = dialogOptions || {};
  useDialoger.getState().create(
    <div className="flex flex-wrap relative -z-1 h-screen justify-center p-2 grow">
      <AttachmentsCarousel items={attachments} isDialog itemIndex={attachmentIndex} saveInSearchParams={saveInSearchParams} />
    </div>,
    {
      id: 'attachment-dialog',
      drawerOnMobile: false,
      className: 'min-w-full h-screen border-0 p-0 rounded-none flex flex-col mt-0',
      headerClassName: 'absolute p-4 w-full backdrop-blur-xs bg-background/50',
      hideClose: true,
      removeCallback,
    },
  );
};
