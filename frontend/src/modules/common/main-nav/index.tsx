import { useNavigate } from '@tanstack/react-router';
import { config } from 'config';
import { type LucideProps, UserX } from 'lucide-react';
import { Fragment, Suspense, lazy, useEffect, useMemo } from 'react';
import { useThemeStore } from '~/store/theme';

import { useBreakpoints } from '~/hooks/use-breakpoints';
import { dialog } from '~/modules/common/dialoger/state';
import { useNavigationStore } from '~/store/navigation';
import { cn } from '~/utils/utils';

import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { impersonationStop } from '~/api/auth';
import { useHotkeys } from '~/hooks/use-hot-keys';
import useMounted from '~/hooks/use-mounted';
import router from '~/lib/router';
import { NavButton } from '~/modules/common/main-nav/main-nav-button';
import { MainSearch } from '~/modules/common/main-search';
import { sheet } from '~/modules/common/sheeter/state';
import { getAndSetMe, getAndSetMenu } from '~/modules/users/helpers';
import { navItems } from '~/nav-config';
import { useUserStore } from '~/store/user';

export type NavItem = {
  id: string;
  icon: React.ElementType<LucideProps>;
  sheet?: React.ReactNode;
  href?: string;
  mirrorOnMobile?: boolean;
};

const DebugToolbars = config.mode === 'development' ? lazy(() => import('~/modules/common/debug-toolbars')) : () => null;

const AppNav = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { hasStarted } = useMounted();
  const isSmallScreen = useBreakpoints('max', 'xl');
  const isMobile = useBreakpoints('max', 'sm');

  const { setLoading, setFocusView, focusView } = useNavigationStore();
  const { theme } = useThemeStore();
  const { user } = useUserStore();

  const currentSession = useMemo(() => user?.sessions.find((s) => s.isCurrent), [user]);

  const stopImpersonation = async () => {
    await impersonationStop();
    await Promise.all([getAndSetMe(), getAndSetMenu()]);
    navigate({ to: config.defaultRedirectPath, replace: true });
    toast.success(t('common:success.stopped_impersonation'));
  };

  const navBackground = theme !== 'none' ? 'bg-primary' : 'bg-primary-foreground';

  const navButtonClick = (navItem: NavItem) => {
    // Search is a special case, it will open a dialog
    if (navItem.id === 'search') {
      return dialog(<MainSearch />, {
        className: 'sm:max-w-2xl p-0 border-0 mb-4',
        drawerOnMobile: false,
        refocus: false,
        hideClose: true,
        autoFocus: !isSmallScreen,
      });
    }

    const sheetSide = isMobile ? (navItem.mirrorOnMobile ? 'right' : 'left') : 'left';
    // If its a route, navigate to it
    if (navItem.href) return navigate({ to: navItem.href });
    sheet.create(navItem.sheet, {
      id: `${navItem.id}-nav`,
      side: sheetSide,
      modal: isMobile,
      className: `fixed sm:z-[80] p-0 ${isMobile ? '' : 'left-16 inset-0 max-w-80'} backdrop-blur-sm`,
    });
  };

  const buttonsClick = (index: number) => {
    if (sheet.getAll().length) return;
    if (dialog.haveOpenDialogs()) return;
    navButtonClick(navItems[index]);
  };

  useHotkeys([
    ['Shift + A', () => buttonsClick(3)],
    ['Shift + F', () => buttonsClick(2)],
    ['Shift + H', () => buttonsClick(1)],
    ['Shift + M', () => buttonsClick(0)],
  ]);

  useEffect(() => {
    router.subscribe('onBeforeLoad', ({ pathChanged, toLocation, fromLocation }) => {
      if (toLocation.pathname !== fromLocation.pathname) {
        // Disable focus view
        setFocusView(false);
        // Remove sheets in content
        sheet.remove();
      }
      pathChanged && setLoading(true);
    });
    router.subscribe('onLoad', () => {
      setLoading(false);
    });
  }, []);

  return (
    <nav
      id="main-nav"
      className={cn(
        'fixed z-[90] w-full max-sm:bottom-0 transition-transform ease-out shadow-sm sm:left-0 sm:top-0 sm:h-screen sm:w-16',
        navBackground,
        !hasStarted && 'max-sm:translate-y-full sm:-translate-x-full',
        focusView && 'hidden',
      )}
    >
      <ul className="flex flex-row justify-between p-1 sm:flex-col sm:space-y-1">
        {navItems.map((navItem: NavItem, index: number) => {
          const isSecondItem = index === 1;
          const isActive = sheet.get(navItem.id);

          const listItemClass = isSecondItem
            ? 'flex xs:absolute xs:left-1/2 sm:left-0 transform xs:-translate-x-1/2 sm:relative sm:transform-none sm:justify-start'
            : 'flex justify-start';

          return (
            <Fragment key={navItem.id}>
              {isSecondItem && <div className="hidden xs:flex xs:grow sm:hidden" />}
              <li className={cn('sm:grow-0', listItemClass)} key={navItem.id}>
                <Suspense>
                  <NavButton navItem={navItem} isActive={isActive} onClick={() => buttonsClick(index)} />
                </Suspense>
              </li>
            </Fragment>
          );
        })}
        {currentSession?.type === 'impersonation' && (
          <Fragment>
            <li className={cn('sm:grow-0', 'flex justify-start')}>
              <NavButton navItem={{ id: 'stop_impersonation', icon: UserX }} onClick={stopImpersonation} isActive={false} />
            </li>
          </Fragment>
        )}
      </ul>
      <Suspense>{DebugToolbars ? <DebugToolbars /> : null}</Suspense>
    </nav>
  );
};

export default AppNav;
