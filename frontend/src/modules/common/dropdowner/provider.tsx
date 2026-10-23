import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { DropdownerDoneTip } from '~/modules/common/dropdowner/done-tip';
import { DropdownerDrawer } from '~/modules/common/dropdowner/drawer';
import { DropdownerDropdown } from '~/modules/common/dropdowner/dropdown';
import { useDropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { useOverlayLock } from '~/modules/common/overlay-store-helpers';

/** Renders the open dropdown: a drawer on mobile, a menu or panel popup on desktop. */
export function Dropdowner() {
  const dropdown = useDropdowner((state) => state.dropdown);
  const isMobile = useBreakpointBelow('sm');

  useOverlayLock('dropdowner', !!dropdown);

  return (
    <>
      {dropdown && (isMobile ? <DropdownerDrawer dropdown={dropdown} /> : <DropdownerDropdown dropdown={dropdown} />)}
      <DropdownerDoneTip />
    </>
  );
}
