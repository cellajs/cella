import AttachmentDialogHandler from '~/modules/attachments/dialog/handler';
import UserSheetHandler from '~/modules/users/user-sheet-handler';

/**
 * Sheets that should always be available in app.
 */
function AppSheets() {
  return (
    <>
      <UserSheetHandler />
      <AttachmentDialogHandler />
    </>
  );
}

export default AppSheets;
