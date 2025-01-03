import { onlineManager } from '@tanstack/react-query';
import { t } from 'i18next';
import { createToast } from '~/lib/toasts';
import AttachmentsCarousel from '~/modules/attachments/carousel';
import { type DialogT, dialog } from '~/modules/common/dialoger/state';

export type Attachments = { src: string; fileType?: string };

export const openAttachmentDialog = (
  attachment: number,
  attachments: Attachments[],
  saveInSearchParams = false,
  dialogOptions?: Omit<DialogT, 'id'>,
) => {
  if (!onlineManager.isOnline()) return createToast(t('common:action.offline.text'), 'warning');

  const { title, removeCallback } = dialogOptions || {};
  dialog(
    <div className="flex flex-wrap relative -z-[1] h-screen justify-center p-2 grow">
      <AttachmentsCarousel slides={attachments} isDialog slide={attachment} saveInSearchParams={saveInSearchParams} />
    </div>,
    {
      id: 'attachment-file-preview',
      drawerOnMobile: false,
      className: 'min-w-full h-screen border-0 p-0 rounded-none flex flex-col mt-0',
      headerClassName: 'absolute p-4 w-full backdrop-blur-sm bg-background/50',
      title: title ?? t('common:view_item', { item: t('common:attachment').toLowerCase() }),
      autoFocus: true,
      removeCallback,
    },
  );
};
