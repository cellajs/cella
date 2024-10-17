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
      id="main-nav"
      data-theme={theme}
      data-started={hasStarted}
      className="fixed z-[100] sm:z-[110] w-full max-sm:bottom-0 transition-transform ease-out shadow-sm sm:left-0 sm:top-0 sm:h-screen sm:w-16 group-[.focus-view]/body:hidden bg-primary data-[theme=none]:bg-secondary data-[started=false]:max-sm:translate-y-full data-[started=false]:sm:-translate-x-full"
    >
      <ul className="flex flex-row justify-between p-1 sm:flex-col sm:space-y-1">
        {items.map((navItem: NavItem, index: number) => {
          const isSecondItem = index === 1;
          const isActive = navSheetOpen === navItem.id;

          return (
            <Fragment key={navItem.id}>
              <div data-second-item={isSecondItem} className="hidden data-[second-item=true]:xs:flex data-[second-item=true]:xs:grow" />
              <li
                data-second-item={isSecondItem}
                className="flex peer transform sm:grow-0
                  data-[second-item=false]:justify-start
                  data-[second-item=true]:xs:absolute
                  data-[second-item=true]:xs:left-1/2
                  data-[second-item=true]:xs:-translate-x-1/2
                  data-[second-item=true]:sm:left-0
                  data-[second-item=true]:sm:relative
                  data-[second-item=true]:sm:transform-none
                  data-[second-item=true]:justify-start
                  "
              >
                <Suspense>
                  <NavButton navItem={navItem} isActive={isActive} onClick={() => onClick(index)} />
                </Suspense>
              </li>
            </Fragment>
          );
        })}
        {currentSession?.type === 'impersonation' && (
          <Fragment>
            <li className="flex justify-start sm:grow-0">
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
