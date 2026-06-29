import { Fragment } from 'react/jsx-runtime';
import { useMountedState } from '~/hooks/use-mounted-state';
import { BottomBarNavButton } from '~/modules/navigation/nav-buttons';
import { useNavigationStore } from '~/modules/navigation/navigation-store';
import type { NavItem, TriggerNavItemFn } from '~/modules/navigation/types';
import { navItems } from '~/nav-config';
import { cn } from '~/utils/cn';

// Cached base nav items
let baseNavItems: NavItem[] | null = null;
function getBaseNavItems() {
  if (!baseNavItems) baseNavItems = navItems.filter(({ type }) => type === 'base');
  return baseNavItems;
}

interface BottomBarNavProps {
  triggerNavItem: TriggerNavItemFn;
}

/**
 * Mobile bottom navigation bar.
 */
export function BottomBarNav({ triggerNavItem }: BottomBarNavProps) {
  const { hasStarted } = useMountedState();
  const navSheetOpen = useNavigationStore((state) => state.navSheetOpen);
  const floatingNavActive = useNavigationStore((state) => state.floatingNavActive);

  if (floatingNavActive) return null;

  return (
    <nav
      id="bottom-bar-nav"
      data-started={hasStarted}
      className="fixed bottom-0 z-100 flex w-full flex-row justify-between bg-sidebar shadow-xs transition-transform ease-out group-[.focus-view]/body:hidden data-[started=false]:translate-y-full"
    >
      <ul className="flex w-full flex-row justify-between p-1 px-2">
        {getBaseNavItems().map((navItem: NavItem, index: number) => {
          const isSecondItem = index === 1;
          const isActive = navSheetOpen === navItem.id;

          return (
            <Fragment key={navItem.id}>
              <li
                key={navItem.id}
                className={cn(
                  'flex transform justify-start',
                  isSecondItem && 'xs:absolute xs:left-1/2 xs:-translate-x-1/2',
                )}
              >
                <BottomBarNavButton navItem={navItem} isActive={isActive} onClick={triggerNavItem} />
              </li>
              {isSecondItem && <div className={'xs:flex hidden xs:grow'} />}
            </Fragment>
          );
        })}
      </ul>
    </nav>
  );
}
