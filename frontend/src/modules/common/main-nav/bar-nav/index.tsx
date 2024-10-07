import { useNavigate } from '@tanstack/react-router';
import { config } from 'config';
import { UserX } from 'lucide-react';
import { Fragment, Suspense, lazy, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { impersonationStop } from '~/api/auth';
import useBodyClass from '~/hooks/use-body-class';
import useMounted from '~/hooks/use-mounted';
import type { NavItem } from '~/modules/common/main-nav';
import { NavButton } from '~/modules/common/main-nav/bar-nav/bar-nav-button';
import { sheet } from '~/modules/common/sheeter/state';
import { getAndSetMe, getAndSetMenu } from '~/modules/users/helpers';
import type { NavItemId } from '~/nav-config';
import { useNavigationStore } from '~/store/navigation';
import { useThemeStore } from '~/store/theme';
import { useUserStore } from '~/store/user';
import { cn } from '~/utils/cn';

const DebugToolbars = config.mode === 'development' ? lazy(() => import('~/modules/common/debug-toolbars')) : () => null;

const BarNav = ({ items, onClick }: { items: NavItem[]; onClick: (id: NavItemId, index: number) => void }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { hasStarted } = useMounted();

  const { user } = useUserStore();
  const { theme } = useThemeStore();
  const { focusView, keepMenuOpen, navSheetOpen } = useNavigationStore();

  const currentSession = useMemo(() => user?.sessions.find((s) => s.isCurrent), [user]);

  // Keep menu open
  useBodyClass({ 'keep-nav-open': keepMenuOpen, 'nav-open': !!navSheetOpen });

  const stopImpersonation = async () => {
    await impersonationStop();
    await Promise.all([getAndSetMe(), getAndSetMenu()]);
    navigate({ to: config.defaultRedirectPath, replace: true });
    toast.success(t('common:success.stopped_impersonation'));
  };

  const navBackground = theme !== 'none' ? 'bg-primary' : 'bg-primary-foreground';
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
        {items.map((navItem: NavItem, index: number) => {
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
                  <NavButton navItem={navItem} isActive={isActive} onClick={() => onClick(navItem.id, index)} />
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

export default BarNav;
