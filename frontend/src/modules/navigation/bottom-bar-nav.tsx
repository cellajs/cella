import { useMountedState } from '~/hooks/use-mounted-state';
import { BottomBarNavItemButton } from '~/modules/navigation/nav-buttons';
import { navItems } from '~/modules/navigation/nav-items';
import { useNavigationStore } from '~/modules/navigation/navigation-store';
import type { NavItem, TriggerNavItemFn } from '~/modules/navigation/types';

// No home button: the menu header links home. The footer items end the row, as they end the desktop nav bar.
const barNavItems: NavItem[] = navItems.filter((item: NavItem) => (item.type === 'base' && item.id !== 'home') || item.type === 'footer');

interface BottomBarNavProps {
  onNavItemClick: TriggerNavItemFn;
}

export function BottomBarNav({ onNavItemClick }: BottomBarNavProps) {
  const { hasStarted } = useMountedState();
  const navSheetOpen = useNavigationStore((state) => state.navSheetOpen);
  const floatingNavActive = useNavigationStore((state) => state.floatingNavActive);

  if (floatingNavActive) return null;

  return (
    <nav
      id="bottom-bar-nav"
      data-started={hasStarted}
      className="fixed bottom-0 z-100 w-full chrome-hidden:translate-y-full select-none bg-sidebar pb-[env(safe-area-inset-bottom,0px)] shadow-xs transition-transform ease-out [-webkit-touch-callout:none] focus-view:hidden data-[started=false]:translate-y-full"
    >
      <ul className="flex w-full justify-between px-2 py-1">
        {barNavItems.map((navItem) => (
          <li key={navItem.id}>
            <BottomBarNavItemButton navItem={navItem} isActive={navSheetOpen === navItem.id} onClick={onNavItemClick} />
          </li>
        ))}
      </ul>
    </nav>
  );
}
