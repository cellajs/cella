import { useNavigate } from '@tanstack/react-router';
import { config } from 'config';
import { UserX } from 'lucide-react';
import { Fragment, Suspense, lazy, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { impersonationStop } from '~/api/auth';
import useMounted from '~/hooks/use-mounted';
import type { NavItem } from '~/modules/common/main-nav';
import { NavButton } from '~/modules/common/main-nav/bar-nav/bar-nav-button';
import { getAndSetMe, getAndSetMenu } from '~/modules/users/helpers';
import { useNavigationStore } from '~/store/navigation';
import { useThemeStore } from '~/store/theme';
import { useUserStore } from '~/store/user';
import { cn } from '~/utils/cn';

const DebugToolbars = config.mode === 'development' ? lazy(() => import('~/modules/common/debug-toolbars')) : () => null;

const BarNav = ({ items, onClick }: { items: NavItem[]; onClick: (index: number) => void }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { hasStarted } = useMounted();

  const { user } = useUserStore();
  const { theme } = useThemeStore();
  const { navSheetOpen } = useNavigationStore();

  const currentSession = useMemo(() => user?.sessions.find((s) => s.isCurrent), [user]);

  const stopImpersonation = async () => {
    await impersonationStop();
    await Promise.all([getAndSetMe(), getAndSetMenu()]);
    navigate({ to: config.defaultRedirectPath, replace: true });
    toast.success(t('common:success.stopped_impersonation'));
  };

  const navBackground = theme !== 'none' ? 'bg-primary' : 'bg-secondary';
  return (
    <nav
      id="main-nav"
      className={cn(
        'fixed z-[100] sm:z-[110] w-full max-sm:bottom-0 transition-transform ease-out shadow-sm sm:left-0 sm:top-0 sm:h-screen sm:w-16 group-[.focus-view]/body:hidden',
        navBackground,
        !hasStarted && 'max-sm:translate-y-full sm:-translate-x-full',
      )}
    >
      <ul className="flex flex-row justify-between p-1 sm:flex-col sm:space-y-1">
        {items.map((navItem: NavItem, index: number) => {
          const isSecondItem = index === 1;
          const isActive = navSheetOpen === navItem.id;

          const listItemClass = isSecondItem
            ? 'flex xs:absolute xs:left-1/2 sm:left-0 transform xs:-translate-x-1/2 sm:relative sm:transform-none sm:justify-start'
            : 'flex justify-start';

          return (
            <Fragment key={navItem.id}>
              {isSecondItem && <div className="hidden xs:flex xs:grow sm:hidden" />}
              <li className={cn('sm:grow-0', listItemClass)} key={navItem.id}>
                <Suspense>
                  <NavButton navItem={navItem} isActive={isActive} onClick={() => onClick(index)} />
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
