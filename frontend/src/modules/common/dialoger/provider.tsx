import { useEffect } from 'react';
import { useBodyClass } from '~/hooks/use-body-class';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { DialogerDialog } from '~/modules/common/dialoger/dialog';
import { DialogerDrawer } from '~/modules/common/dialoger/drawer';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { useUIStore } from '~/modules/ui/ui-store';
import { router } from '~/routes/router';

/**
 * Dialoger provider to render drawers on mobile and dialogs on other screens.
 * State is managed by the useDialoger zustand store hook.
 */
export function Dialoger() {
  const isMobile = useBreakpointBelow('sm');
  const dialogs = useDialoger((state) => state.dialogs);
  const { lockUI, unlockUI } = useUIStore();

  useBodyClass({ 'dialoger-open': dialogs.length > 0 });

  // Lock UI when dialogs are open
  useEffect(() => {
    if (dialogs.length > 0) {
      lockUI('dialoger');
      return () => unlockUI('dialoger');
    }
  }, [dialogs.length > 0]);

  // Close all dialogs on route change
  useEffect(() => {
    return router.subscribe('onBeforeLoad', ({ pathChanged }) => {
      if (pathChanged) useDialoger.getState().remove();
    });
  }, []);

  if (!dialogs.length) return null;

  return dialogs.map((dialog) => {
    const DialogComponent = !isMobile || !dialog.drawerOnMobile ? DialogerDialog : DialogerDrawer;
    return <DialogComponent key={dialog.id} dialog={dialog} />;
  });
}
