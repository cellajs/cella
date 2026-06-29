import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import { AppNavLoader } from '~/modules/navigation/app-nav-loader';
import type { NavItem, TriggerNavItemFn } from '~/modules/navigation/types';
import { useTotalUnseenCount } from '~/modules/seen/use-unseen-count';
import { SidebarMenuButton, SidebarMenuItem } from '~/modules/ui/sidebar';
import { useUserStore } from '~/modules/user/user-store';
import { cn } from '~/utils/cn';

const { hasSidebarTextLabels } = appConfig.theme.navigation;

interface NavButtonProps {
  navItem: NavItem;
  isActive: boolean;
  isCollapsed: boolean;
  onClick: TriggerNavItemFn;
}

/**
 * App nav icon (avatar for account, loader for home, or item icon) used by both sidebar and bottom bar.
 */
function AppNavIcon({ navItem, className }: { navItem: NavItem; className?: string }) {
  const { user } = useUserStore();

  if (navItem.id === 'account' && user) {
    return (
      <EntityAvatar
        type="user"
        className={cn(
          '-m-0.5 size-7 shrink-0 rounded-full border-[0.1rem] border-primary text-base transition-transform group-hover:scale-110',
          className,
        )}
        id={user.id}
        name={user.name}
        url={user.thumbnailUrl}
      />
    );
  }

  if (navItem.id === 'home') {
    return <AppNavLoader className={'size-5 min-h-5 min-w-5 shrink-0'} />;
  }

  const NavItemIcon = navItem.icon;

  return (
    <NavItemIcon
      className={cn('size-5 min-h-5 min-w-5 shrink-0 transition-transform group-hover:scale-110', className)}
      strokeWidth={1.8}
    />
  );
}

/**
 * App sidebar nav button.
 */
export function NavButton({ navItem, isActive, isCollapsed, onClick }: NavButtonProps) {
  const { t } = useTranslation();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const totalUnseenCount = useTotalUnseenCount();

  const showTooltip = isCollapsed || !hasSidebarTextLabels;
  const showUnseenBadge = navItem.id === 'menu' && totalUnseenCount > 0 && !isActive;

  return (
    <SidebarMenuItem className="flex grow-0 transform justify-start pb-2">
      <SidebarMenuButton
        ref={buttonRef}
        size="lg"
        data-collapsed={isCollapsed}
        tooltip={{ children: t(`c:${navItem.id}`), hidden: !showTooltip }}
        onClick={() => onClick(navItem.id, buttonRef)}
        isActive={isActive}
        className="group linear relative h-14 w-full justify-center text-sidebar-foreground ring-inset transition-[width] duration-200 hover:bg-background/30 focus-visible:ring-offset-0 data-[collapsed=true]:w-16 data-[active=true]:bg-background/50"
      >
        <AppNavIcon navItem={navItem} />
        {showUnseenBadge && (
          <span className="absolute top-2 left-8 flex h-4 min-w-4 items-center justify-center rounded-full bg-background px-1 font-bold text-[0.6rem] text-primary leading-none group-data-[collapsed=true]:left-8">
            {totalUnseenCount > 99 ? '99+' : totalUnseenCount}
          </span>
        )}
        {hasSidebarTextLabels && (
          <span className="linear w-auto overflow-hidden whitespace-nowrap pl-1.5 font-medium opacity-100 transition-[opacity,width] duration-200 group-data-[collapsed=true]:w-0 group-data-[collapsed=true]:opacity-0">
            {t(`c:${navItem.id}`)}
          </span>
        )}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/**
 * Mobile bottom bar nav button
 */
export function BottomBarNavButton({ navItem, isActive, onClick }: Omit<NavButtonProps, 'isCollapsed'>) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const totalUnseenCount = useTotalUnseenCount();

  const showUnseenBadge = navItem.id === 'menu' && totalUnseenCount > 0 && !isActive;

  return (
    <button
      ref={buttonRef}
      type="button"
      id={`${navItem.id}-nav`}
      data-active={isActive}
      onClick={() => onClick(navItem.id, buttonRef)}
      className={cn(
        'group relative flex size-14 items-center justify-center rounded-md ring-inset focus-visible:ring-offset-0',
        'hover:bg-background/30 data-[active=true]:bg-background/50',
        'text-sidebar-foreground',
      )}
    >
      <AppNavIcon navItem={navItem} />
      {showUnseenBadge && (
        <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-background px-1 font-bold text-[0.6rem] text-primary leading-none">
          {totalUnseenCount > 99 ? '99+' : totalUnseenCount}
        </span>
      )}
    </button>
  );
}
