import { useCallback, useEffect } from 'react';
import useBodyClass from '~/hooks/use-body-class';
import { useBoundaryCleanup } from '~/hooks/use-boundary-cleanup';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import DialogerDialog from '~/modules/common/dialoger/dialog';
import DialogerDrawer from '~/modules/common/dialoger/drawer';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { useUIStore } from '~/store/ui';

/**
 * Dialoger provider to render drawers on mobile and dialogs on other screens.
 * State is managed by the useDialoger zustand store hook.
 */
export function Dialoger() {
  const isMobile = useBreakpoints('max', 'sm');
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

  // Close dialogs that morph between drawer/dialog (drawerOnMobile) on resize
  const getItemsToCloseOnResize = useCallback(
    () =>
      useDialoger
        .getState()
        .dialogs.filter((d) => d.drawerOnMobile)
        .map((d) => d.id),
    [],
  );
  const closeAll = useCallback(() => useDialoger.getState().remove(undefined, { isCleanup: true }), []);
  const closeById = useCallback((id: string | number) => useDialoger.getState().remove(id, { isCleanup: true }), []);

  useBoundaryCleanup(getItemsToCloseOnResize, closeAll, closeById);

  if (!dialogs.length) return null;

  return dialogs.map((dialog) => {
    const DialogComponent = !isMobile || !dialog.drawerOnMobile ? DialogerDialog : DialogerDrawer;
    return <DialogComponent key={dialog.id} dialog={dialog} />;
  });
}
