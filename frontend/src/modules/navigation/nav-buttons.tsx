import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import { AppNavLoader } from '~/modules/navigation/app-nav-loader';
import type { NavItem, TriggerNavItemFn } from '~/modules/navigation/types';
import { useTotalUnseenCount } from '~/modules/seen/use-unseen-count';
import { SidebarMenuButton, SidebarMenuItem } from '~/modules/ui/sidebar';
import { useUserStore } from '~/store/user';
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
          'border-[0.1rem] size-7 -m-0.5 shrink-0 rounded-full text-base border-primary group-hover:scale-110 transition-transform',
          className,
        )}
        id={user.id}
        name={user.name}
        url={user.thumbnailUrl}
      />
    );
  }

  if (navItem.id === 'home') {
    return <AppNavLoader className={'size-5 min-w-5 min-h-5 shrink-0'} />;
  }

  const NavItemIcon = navItem.icon;

  return (
    <NavItemIcon
      className={cn('group-hover:scale-110 transition-transform size-5 min-w-5 min-h-5 shrink-0', className)}
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
    <SidebarMenuItem className="flex transform grow-0 justify-start pb-2">
      <SidebarMenuButton
        ref={buttonRef}
        size="lg"
        data-collapsed={isCollapsed}
        tooltip={{ children: t(`common:${navItem.id}`), hidden: !showTooltip }}
        onClick={() => onClick(navItem.id, buttonRef)}
        isActive={isActive}
        className="h-14 ring-inset focus-visible:ring-offset-0 group transition-[width] duration-200 linear
          data-[active=true]:bg-background/50 hover:bg-background/30
          text-sidebar-foreground
          w-full data-[collapsed=true]:w-16 justify-center relative"
      >
        <AppNavIcon navItem={navItem} />
        {showUnseenBadge && (
          <span className="absolute top-2 left-8 group-data-[collapsed=true]:left-8 min-w-4 h-4 flex items-center justify-center rounded-full bg-background text-primary text-[0.6rem] font-bold px-1 leading-none">
            {totalUnseenCount > 99 ? '99+' : totalUnseenCount}
          </span>
        )}
        {hasSidebarTextLabels && (
          <span
            className="pl-1.5 font-medium whitespace-nowrap transition-[opacity,width] duration-200 linear overflow-hidden
            opacity-100 w-auto group-data-[collapsed=true]:opacity-0 group-data-[collapsed=true]:w-0"
          >
            {t(`common:${navItem.id}`)}
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
        'ring-inset focus-visible:ring-offset-0 group size-14 flex items-center justify-center rounded-md relative',
        'data-[active=true]:bg-background/50 hover:bg-background/30',
        'text-sidebar-foreground',
      )}
    >
      <AppNavIcon navItem={navItem} />
      {showUnseenBadge && (
        <span className="absolute top-1 right-1 min-w-4 h-4 flex items-center justify-center rounded-full bg-background text-primary text-[0.6rem] font-bold px-1 leading-none">
          {totalUnseenCount > 99 ? '99+' : totalUnseenCount}
        </span>
      )}
    </button>
  );
}
