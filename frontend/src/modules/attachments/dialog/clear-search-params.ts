import router from '~/lib/router';

/**
 * Handler for attachment dialog.
 * It creates and removes an attachment dialog by listening to `attachmentDialogId` in search parameters.
 */
export const clearAttachmentDialogSearchParams = () => {
  router.navigate({
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
