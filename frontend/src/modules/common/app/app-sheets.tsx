import { AttachmentDialogHandler } from '~/modules/attachment/dialog/handler';
import { UserSheetHandler } from '~/modules/user/user-sheet-handler';

/**
 * Sheets that should always be available in app.
 */
export function AppSheets() {
  return (
    <>
      <UserSheetHandler />
      <AttachmentDialogHandler />
    </>
  );
}
