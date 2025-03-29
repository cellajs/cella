import { useBreakpoints } from '~/hooks/use-breakpoints';
import { useDropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import DropdownDrawer from './drawer';
import { DesktopDropdown } from './dropdown';

export function Dropdowner() {
  const dropdown = useDropdowner((state) => state.dropdown);
  const isMobile = useBreakpoints('max', 'sm');

  if (!dropdown) return null;
  if (isMobile) return <DropdownDrawer dropdown={dropdown} />;
  return <DesktopDropdown dropdown={dropdown} />;
}
