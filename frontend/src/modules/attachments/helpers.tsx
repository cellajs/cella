import { onlineManager } from '@tanstack/react-query';
import { t } from 'i18next';
import AttachmentsCarousel from '~/modules/attachments/carousel';
import { type DialogT, dialog } from '~/modules/common/dialoger/state';
import { createToast } from '~/modules/common/toaster';

export type CarouselAttachment = { src: string; filename?: string; name?: string; fileType?: string };

export const openAttachmentDialog = (
  attachment: number,
  attachments: CarouselAttachment[],
  saveInSearchParams = false,
  dialogOptions?: Omit<DialogT, 'id'>,
) => {
  if (!onlineManager.isOnline()) return createToast(t('common:action.offline.text'), 'warning');

  const { removeCallback } = dialogOptions || {};
  dialog(
    <div className="flex flex-wrap relative -z-1 h-screen justify-center p-2 grow">
      <AttachmentsCarousel slides={attachments} isDialog slide={attachment} saveInSearchParams={saveInSearchParams} />
    </div>,
    {
      id: 'attachment-file-preview',
      drawerOnMobile: false,
      className: 'min-w-full h-screen border-0 p-0 rounded-none flex flex-col mt-0',
      headerClassName: 'absolute p-4 w-full backdrop-blur-xs bg-background/50',
      hideClose: true,
      autoFocus: true,
      removeCallback,
    },
  );
};
