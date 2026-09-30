import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { DropdownerDrawer } from '~/modules/common/dropdowner/drawer';
import { DropdownerDropdown } from '~/modules/common/dropdowner/dropdown';
import { useDropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { useOverlayLock } from '~/modules/common/overlay-store-helpers';

/**
 * Renders dropdowns as drawers on mobile and popovers on desktop.
 */
export function Dropdowner() {
  const dropdown = useDropdowner((state) => state.dropdown);
  const isMobile = useBreakpointBelow('sm');

  useOverlayLock('dropdowner', !!dropdown);

  if (!dropdown) return null;
  if (isMobile) return <DropdownerDrawer dropdown={dropdown} />;
  return <DropdownerDropdown dropdown={dropdown} />;
}
