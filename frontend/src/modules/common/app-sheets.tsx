import AttachmentDialogHandler from '~/modules/attachments/attachment-dialog/handler';
import UserSheetHandler from '~/modules/users/user-sheet-handler';

/**
 * Sheets that should always be available in the app.
 */
const AppSheets = () => {
  return (
    <>
      <UserSheetHandler />
      <AttachmentDialogHandler />
    </>
  );
};

export default AppSheets;
