import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import { AppNavLoader } from '~/modules/navigation/app-nav-loader';
import type { NavItem, TriggerNavItemFn } from '~/modules/navigation/types';
import { SidebarMenuButton, SidebarMenuItem } from '~/modules/ui/sidebar';
import { useUIStore } from '~/store/ui';
import { useUserStore } from '~/store/user';
import { cn } from '~/utils/cn';

const { hasSidebarTextLabels } = appConfig.theme.navigation;

export interface NavButtonProps {
  navItem: NavItem;
  isActive: boolean;
  isCollapsed: boolean;
  onClick: TriggerNavItemFn;
}

/**
 * App nav icon (avatar for account, loader for home, or item icon) used by both sidebar and bottom bar.
 */
export function AppNavIcon({ navItem, className }: { navItem: NavItem; className?: string }) {
  const { user } = useUserStore();

  if (navItem.id === 'account' && user) {
    return (
      <AvatarWrap
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
  const theme = useUIStore((state) => state.theme);

  const showTooltip = isCollapsed || !hasSidebarTextLabels;

  return (
    <SidebarMenuItem className="flex transform grow-0 justify-start pb-2">
      <SidebarMenuButton
        ref={buttonRef}
        size="lg"
        data-collapsed={isCollapsed}
        tooltip={{ children: t(`common:${navItem.id}`), hidden: !showTooltip }}
        onClick={() => onClick(navItem.id, buttonRef)}
        isActive={isActive}
        data-theme={theme}
        className="h-14 ring-inset focus-visible:ring-offset-0 group transition-[width] duration-200 linear
          data-[active=true]:bg-background/50 hover:bg-background/30
          text-primary-foreground data-[theme=none]:text-inherit
          w-full data-[collapsed=true]:w-16 justify-center"
      >
        <AppNavIcon navItem={navItem} />
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
  const theme = useUIStore((state) => state.theme);

  return (
    <button
      ref={buttonRef}
      type="button"
      id={`${navItem.id}-nav`}
      data-theme={theme}
      data-active={isActive}
      onClick={() => onClick(navItem.id, buttonRef)}
      className={cn(
        'ring-inset focus-visible:ring-offset-0 group size-14 flex items-center justify-center rounded-md',
        'data-[active=true]:bg-background/50 hover:bg-background/30',
        'text-primary-foreground data-[theme=none]:text-inherit',
      )}
    >
      <AppNavIcon navItem={navItem} />
    </button>
  );
}
