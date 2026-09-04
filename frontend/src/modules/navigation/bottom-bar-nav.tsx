import { useMountedState } from '~/hooks/use-mounted-state';
import { BottomBarNavButton } from '~/modules/navigation/nav-buttons';
import { useNavigationStore } from '~/modules/navigation/navigation-store';
import type { NavItem, TriggerNavItemFn } from '~/modules/navigation/types';
import { navItems } from '~/nav-config';

let baseNavItems: NavItem[] | null = null;
function getBaseNavItems() {
  if (!baseNavItems) baseNavItems = navItems.filter(({ type }) => type === 'base');
  return baseNavItems;
}

interface BottomBarNavProps {
  triggerNavItem: TriggerNavItemFn;
}

export function BottomBarNav({ triggerNavItem }: BottomBarNavProps) {
  const { hasStarted } = useMountedState();
  const navSheetOpen = useNavigationStore((state) => state.navSheetOpen);
  const floatingNavActive = useNavigationStore((state) => state.floatingNavActive);

  if (floatingNavActive) return null;

  return (
    <nav
      id="bottom-bar-nav"
      data-started={hasStarted}
      className="fixed bottom-0 z-100 flex w-full flex-row justify-between bg-sidebar pb-[env(safe-area-inset-bottom,0px)] shadow-xs transition-transform ease-out group-[.focus-view]/body:hidden group-[.selection-active]/body:translate-y-full data-[started=false]:translate-y-full"
    >
      <ul className="flex w-full flex-row justify-between p-1 px-2">
        {getBaseNavItems().map((navItem: NavItem) => (
          <li key={navItem.id} className="flex transform justify-start">
            <BottomBarNavButton navItem={navItem} isActive={navSheetOpen === navItem.id} onClick={triggerNavItem} />
          </li>
        ))}
      </ul>
    </nav>
  );
}
