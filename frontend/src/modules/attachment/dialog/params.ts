import type { DialogData } from '~/modules/common/dialoger/use-dialoger';
import { getRouter } from '~/routes/-router-instance';

/** Search param holding the open attachment's id. Its presence is the dialog's open state. */
export const ATTACHMENT_DIALOG_PARAM = 'attachmentDialogId';

/** Params cleared alongside the dialog id when it closes. */
const ATTACHMENT_DIALOG_EXTRA_PARAMS = ['groupId'] as const;

/** Chrome shared by both ways of opening the carousel (URL-driven and imperative). */
export const attachmentDialogClassName = 'min-w-full h-dvh max-h-dvh border-0 p-0 rounded-none flex flex-col mt-0';

/** Wrapper the carousel is mounted in, identical for both dialog entry points. */
export const attachmentDialogContentClassName = 'relative -z-1 flex h-dvh grow flex-wrap justify-center p-2';

export function openAttachmentDialogSearch(attachmentId: string, groupId?: string | null) {
  return (prev: Record<string, unknown>) => ({
    ...prev,
    [ATTACHMENT_DIALOG_PARAM]: attachmentId,
    groupId: groupId || undefined,
  });
}

export function clearAttachmentDialogSearch(prev: Record<string, unknown>) {
  const next: Record<string, unknown> = { ...prev };
  for (const key of [ATTACHMENT_DIALOG_PARAM, ...ATTACHMENT_DIALOG_EXTRA_PARAMS]) next[key] = undefined;
  return next;
}

/** Clears the dialog search params through the router instance, where `to: '.'` resolves against the current location. */
export const clearAttachmentDialogSearchParams = () => {
  getRouter().navigate({
    to: '.',
    replace: true,
    resetScroll: false,
    search: clearAttachmentDialogSearch,
  });
};

/** Dialoger options shared by both entry points; `headerClassName` differs per caller. */
export function attachmentDialogOptions(overrides: DialogData): DialogData {
  return {
    drawerOnMobile: false,
    className: attachmentDialogClassName,
    ...overrides,
  };
}
