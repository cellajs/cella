import { config } from 'config';
import { Fragment, Suspense, lazy, useMemo } from 'react';
import useMounted from '~/hooks/use-mounted';
import { BarNavButton } from '~/modules/navigation/bar-nav/button';
import { type NavItem, navItems } from '~/nav-config';
import { useNavigationStore } from '~/store/navigation';
import { useThemeStore } from '~/store/theme';
import { cn } from '~/utils/cn';
import StopImpersonation from './stop-impersonation';

const DebugToolbars = config.mode === 'development' ? lazy(() => import('~/modules/common/debug-toolbars')) : () => null;

const BarNav = ({ onClick }: { onClick: (id: NavItem['id']) => void }) => {
  const { hasStarted } = useMounted();

  const { theme } = useThemeStore();
  const { navSheetOpen } = useNavigationStore();

  const items = useMemo(() => {
    const items = navItems.filter(({ type }) => type === 'base');
    return items;
  }, []);

  return (
    <nav
      id="bar-nav"
      data-theme={theme}
      data-started={hasStarted}
      className="fixed z-100 sm:z-110 flex justify-between flex-col w-full max-sm:bottom-0 transition-transform ease-out shadow-xs sm:left-0 sm:top-0 sm:h-screen sm:w-16 group-[.focus-view]/body:hidden bg-primary data-[theme=none]:bg-secondary max-sm:data-[started=false]:translate-y-full sm:data-[started=false]:-translate-x-full"
    >
      <ul className="flex flex-row justify-between p-1 sm:flex-col sm:gap-1 max-sm:px-2">
        {items.map((navItem: NavItem, index: number) => {
          const isSecondItem = index === 1;
          const isActive = navSheetOpen === navItem.id;

          return (
            <Fragment key={navItem.id}>
              <div className={`hidden ${isSecondItem && 'xs:flex sm:hidden xs:grow'}`} />

              <li
                className={cn(
                  'flex peer transform sm:grow-0 justify-start',
                  isSecondItem && 'xs:absolute xs:left-1/2 xs:-translate-x-1/2 sm:left-0 sm:relative sm:translate-x-0',
                )}
              >
                <Suspense>
                  <BarNavButton navItem={navItem} isActive={isActive} onClick={() => onClick(navItem.id)} />
                </Suspense>
              </li>
            </Fragment>
          );
        })}
      </ul>
      <div className="max-sm:hidden p-2">
        <Suspense>{DebugToolbars ? <DebugToolbars /> : null}</Suspense>
        <StopImpersonation />
      </div>
    </nav>
  );
};

export default BarNav;
