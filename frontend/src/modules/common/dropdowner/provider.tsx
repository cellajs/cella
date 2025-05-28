import useBodyClass from '~/hooks/use-body-class';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import DropdownDrawer from '~/modules/common/dropdowner/drawer';
import { DesktopDropdown } from '~/modules/common/dropdowner/dropdown';
import { useDropdowner } from '~/modules/common/dropdowner/use-dropdowner';

export function Dropdowner() {
  const dropdown = useDropdowner((state) => state.dropdown);
  const isMobile = useBreakpoints('max', 'sm');

  // Apply body class
  useBodyClass({ 'dropdowner-open': !!dropdown });

  if (!dropdown) return null;
  if (isMobile) return <DropdownDrawer dropdown={dropdown} />;
  return <DesktopDropdown dropdown={dropdown} />;
}
