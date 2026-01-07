import { Fragment } from 'react/jsx-runtime';
import useMounted from '~/hooks/use-mounted';
import { BottomBarNavButton } from '~/modules/navigation/nav-buttons';
import type { NavItem, TriggerNavItemFn } from '~/modules/navigation/types';
import { navItems } from '~/nav-config';
import { useNavigationStore } from '~/store/navigation';
import { useUIStore } from '~/store/ui';
import { cn } from '~/utils/cn';

// Cached base nav items
let baseNavItems: NavItem[] | null = null;
const getBaseNavItems = () => {
  if (!baseNavItems) baseNavItems = navItems.filter(({ type }) => type === 'base');
  return baseNavItems;
};

interface BottomBarNavProps {
  triggerNavItem: TriggerNavItemFn;
}

/**
 * Mobile bottom navigation bar.
 */
export function BottomBarNav({ triggerNavItem }: BottomBarNavProps) {
  const { hasStarted } = useMounted();
  const theme = useUIStore((state) => state.theme);
  const navSheetOpen = useNavigationStore((state) => state.navSheetOpen);

  return (
    <nav
      id="bottom-bar-nav"
      data-theme={theme}
      data-started={hasStarted}
      className="in-[.floating-nav]:hidden fixed z-100 flex justify-between flex-row w-full bottom-0 transition-transform ease-out shadow-xs bg-primary data-[theme=none]:bg-secondary data-[started=false]:translate-y-full group-[.focus-view]/body:hidden"
    >
      <ul className="flex flex-row justify-between p-1 w-full px-2">
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
              {isSecondItem && <div className={`hidden xs:flex xs:grow`} />}
            </Fragment>
          );
        })}
      </ul>
    </nav>
  );
}

export default BottomBarNav;
