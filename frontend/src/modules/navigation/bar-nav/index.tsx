import { useNavigate } from '@tanstack/react-router';
import { config } from 'config';
import { UserX } from 'lucide-react';
import { Fragment, Suspense, lazy, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import useMounted from '~/hooks/use-mounted';
import { impersonationStop } from '~/modules/auth/api';
import type { NavItem } from '~/modules/navigation';
import { BarNavButton } from '~/modules/navigation/bar-nav/button';
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

  return (
    <nav
      id="app-nav"
      data-theme={theme}
      data-started={hasStarted}
      className="fixed z-100 sm:z-110 w-full max-sm:bottom-0 transition-transform ease-out shadow-xs sm:left-0 sm:top-0 sm:h-screen sm:w-16 group-[.focus-view]/body:hidden bg-primary data-[theme=none]:bg-secondary max-sm:data-[started=false]:translate-y-full sm:data-[started=false]:-translate-x-full"
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
                  <BarNavButton navItem={navItem} isActive={isActive} onClick={() => onClick(index)} />
                </Suspense>
              </li>
            </Fragment>
          );
        })}
        {currentSession?.type === 'impersonation' && (
          <Fragment>
            <li className="flex justify-start sm:grow-0">
              <BarNavButton navItem={{ id: 'stop_impersonation', icon: UserX }} onClick={stopImpersonation} isActive={false} />
            </li>
          </Fragment>
        )}
      </ul>
      <Suspense>{DebugToolbars ? <DebugToolbars /> : null}</Suspense>
    </nav>
  );
};

export default BarNav;
