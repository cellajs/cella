import type { DialogData } from '~/modules/common/dialoger/use-dialoger';
import { getRouter } from '~/routes/-router-instance';
import { tw } from '~/utils/tw';

/** Search param holding the open attachment's id. Its presence is the dialog's open state. */
export const attachmentDialogParam = 'attachmentDialogId';

/** Search param holding the upload group the dialog pages through, cleared with the dialog id. */
export const attachmentGroupParam = 'groupId';

/** Dialog id of the URL-driven viewer; a stable id keeps carousel navigation from recreating the dialog. */
export const attachmentUrlDialogId = 'attachment-url-dialog';

/** Dialog id of the viewer `openAttachmentDialog` opens, apart from the URL-driven one. */
export const attachmentDialogId = 'attachment-dialog';

export function openAttachmentDialogSearch(attachmentId: string, groupId?: string | null) {
  return (prev: Record<string, unknown>) => ({ ...prev, [attachmentDialogParam]: attachmentId, [attachmentGroupParam]: groupId || undefined });
}

export function clearAttachmentDialogSearch(prev: Record<string, unknown>) {
  return { ...prev, [attachmentDialogParam]: undefined, [attachmentGroupParam]: undefined };
}

/** Clears the dialog search params through the router instance, where `to: '.'` resolves against the current location. */
export function clearAttachmentDialogFromUrl() {
  getRouter().navigate({ to: '.', replace: true, resetScroll: false, search: clearAttachmentDialogSearch });
}

/** Dialoger options shared by both entry points. Below `lg` the viewer fills the screen; from `lg` it is a panel 1.25rem inside the viewport, with the page in view under the scrim. */
export function attachmentDialogOptions(overrides: DialogData): DialogData {
  return {
    drawerOnMobile: false,
    className: tw(
      'flex h-dvh max-h-dvh min-w-full flex-col rounded-none p-0 max-sm:pt-0 lg:h-[calc(100%-2.5rem)] lg:w-[calc(100%-2.5rem)] lg:min-w-0 lg:rounded-lg',
    ),
    ...overrides,
  };
}
