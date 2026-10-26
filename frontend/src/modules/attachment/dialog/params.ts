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

/** Chrome shared by both ways of opening the carousel (URL-driven and imperative). */
const attachmentDialogClassName = tw('flex h-dvh max-h-dvh min-w-full flex-col rounded-none p-0');

/** Wrapper the carousel is mounted in, identical for both dialog entry points. */
export const attachmentDialogContentClassName = tw('relative h-dvh p-2');

/**
 * Per-slide stage insets: a fitted image stays clear of the fixed header (3rem) and, from `sm` up where the pan/zoom
 * viewer renders them, the zoom controls (3.25rem from the bottom). Zoomed-in content still slides under the
 * translucent chrome because overflow clips at the padding edge.
 */
export const attachmentDialogStageClassName = tw('pt-12 sm:pb-14');

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

/** Dialoger options shared by both entry points. */
export function attachmentDialogOptions(overrides: DialogData): DialogData {
  return { drawerOnMobile: false, className: attachmentDialogClassName, ...overrides };
}
