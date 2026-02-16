import { useEffect } from 'react';
import { useBodyClass } from '~/hooks/use-body-class';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { DropdownerDrawer } from '~/modules/common/dropdowner/drawer';
import { DropdownerDropdown } from '~/modules/common/dropdowner/dropdown';
import { useDropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { useUIStore } from '~/store/ui';

/**
 * Renders dropdowns as drawers on mobile and popovers on desktop.
 */
export function Dropdowner() {
  const dropdown = useDropdowner((state) => state.dropdown);
  const isMobile = useBreakpoints('max', 'sm');
  const { lockUI, unlockUI } = useUIStore();

  // Apply body class
  useBodyClass({ 'dropdowner-open': !!dropdown });

  // Lock UI when dropdown is open
  useEffect(() => {
    if (dropdown) {
      lockUI('dropdowner');
      return () => unlockUI('dropdowner');
    }
  }, [!!dropdown]);

  if (!dropdown) return null;
  if (isMobile) return <DropdownerDrawer dropdown={dropdown} />;
  return <DropdownerDropdown dropdown={dropdown} />;
}
