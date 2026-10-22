import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { DialogerDialog } from '~/modules/common/dialoger/dialog';
import { DialogerDrawer } from '~/modules/common/dialoger/drawer';
import { dialoger, useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { useOnPathChange, useOverlayLock } from '~/modules/common/overlay-store-helpers';

/**
 * Renders drawers on mobile and dialogs on other screens, from the useDialoger store.
 */
export function Dialoger() {
  const isMobile = useBreakpointBelow('sm');
  const dialogs = useDialoger((state) => state.dialogs);

  useOverlayLock('dialoger', dialogs.length > 0);

  useOnPathChange(() => dialoger.getState().remove(undefined, { isCleanup: true }));

  if (!dialogs.length) return null;

  return dialogs.map((dialog) => {
    const DialogComponent = !isMobile || !dialog.drawerOnMobile ? DialogerDialog : DialogerDrawer;
    return <DialogComponent key={dialog.id} dialog={dialog} />;
  });
}
