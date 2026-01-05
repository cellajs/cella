import { appConfig } from 'config';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import SidebarLoader from '~/modules/navigation/sidebar-loader';
import type { NavItem, TriggerNavItemFn } from '~/modules/navigation/types';
import { SidebarMenuButton, SidebarMenuItem } from '~/modules/ui/sidebar';
import { useUIStore } from '~/store/ui';
import { useUserStore } from '~/store/user';
import { cn } from '~/utils/cn';

export interface NavButtonProps {
  navItem: NavItem;
  isActive: boolean;
  isCollapsed: boolean;
  onClick: TriggerNavItemFn;
}

/**
 * Renders the appropriate icon for a nav item
 */
export function NavItemIcon({ navItem, className }: { navItem: NavItem; className?: string }) {
  const { user } = useUserStore();

  if (navItem.id === 'account' && user) {
    return (
      <AvatarWrap
        type="user"
        className={cn(
          'border-[0.1rem] size-6 -m-0.5 shrink-0 rounded-full sm:ml-0 text-base border-primary group-hover:scale-110 transition-transform',
          className,
        )}
        id={user.id}
        name={user.name}
        url={user.thumbnailUrl}
      />
    );
  }

  if (navItem.id === 'home') {
    return <SidebarLoader className={'size-5 min-w-5 min-h-5 sm:ml-0.5 shrink-0'} />;
  }

  return (
    <navItem.icon
      className={cn('group-hover:scale-110 transition-transform size-5 min-w-5 min-h-5 sm:ml-0.5 shrink-0', className)}
      strokeWidth={appConfig.theme.strokeWidth}
    />
  );
}

/**
 * Desktop navigation button - used in the sidebar
 */
export function NavButton({ navItem, isActive, isCollapsed, onClick }: NavButtonProps) {
  const { t } = useTranslation();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const theme = useUIStore((state) => state.theme);

  return (
    <SidebarMenuItem className="flex transform grow-0 justify-start pb-2">
      <SidebarMenuButton
        ref={buttonRef}
        size="lg"
        tooltip={{ children: t(`common:${navItem.id}`), hidden: !isCollapsed }}
        onClick={() => onClick(navItem.id, buttonRef)}
        isActive={isActive}
        data-theme={theme}
        className={cn(
          'h-12 ring-inset pl-3 focus-visible:ring-offset-0 group transition-[width] duration-200 linear',
          'data-[active=true]:bg-background/50 hover:bg-background/30',
          'text-primary-foreground data-[theme=none]:text-inherit',
          isCollapsed ? 'w-12' : 'w-full',
        )}
      >
        <NavItemIcon navItem={navItem} />
        <span
          className={cn(
            'pl-1 font-medium whitespace-nowrap transition-[opacity,width] duration-200 linear overflow-hidden',
            isCollapsed ? 'opacity-0 w-0' : 'opacity-100 w-auto',
          )}
        >
          {t(`common:${navItem.id}`)}
        </span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/**
 * Mobile navigation button - used in the bottom bar on mobile
 */
export function MobileNavButton({ navItem, isActive, onClick }: Omit<NavButtonProps, 'isCollapsed'>) {
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
      <NavItemIcon navItem={navItem} />
    </button>
  );
}
