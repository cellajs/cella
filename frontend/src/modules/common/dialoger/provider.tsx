import useBodyClass from '~/hooks/use-body-class';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import StandardDialog from '~/modules/common/dialoger/dialog';
import DrawerDialog from '~/modules/common/dialoger/drawer';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';

/**
 * Dialoger provider to render drawers on mobile and dialogs on other screens.
 * State is managed by the useDialoger zustand store hook.
 */
export function Dialoger() {
  const isMobile = useBreakpoints('max', 'sm');

  // Get dialogs from store
  const dialogs = useDialoger((state) => state.dialogs);

  // Apply body class
  useBodyClass({ 'dialoger-open': dialogs.length > 0 });

  if (!dialogs.length) return null;

  return dialogs.map((dialog) => {
    const DialogComponent = !isMobile || !dialog.drawerOnMobile ? StandardDialog : DrawerDialog;
    return <DialogComponent key={dialog.id} dialog={dialog} />;
  });
}
