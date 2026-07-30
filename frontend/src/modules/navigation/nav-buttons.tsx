import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import type { NavItem, TriggerNavItemFn } from '~/modules/navigation/types';
import { SidebarMenuButton, SidebarMenuItem } from '~/modules/ui/sidebar';
import { cn } from '~/utils/cn';

const { hasSidebarTextLabels } = appConfig.theme.navigation;

interface NavButtonProps {
  navItem: NavItem;
  isActive: boolean;
  isCollapsed: boolean;
  onClick: TriggerNavItemFn;
}

/**
 * App nav icon used by both sidebar and bottom bar: the item's `iconSlot` when configured
 * (avatar, loader), its `icon` otherwise.
 */
function AppNavIcon({ navItem, className }: { navItem: NavItem; className?: string }) {
  const iconClass = cn('size-5 min-h-5 min-w-5 shrink-0 transition-transform group-hover:scale-110', className);

  if (navItem.iconSlot) {
    const IconSlot = navItem.iconSlot;
    return <IconSlot className={iconClass} />;
  }

  const NavItemIcon = navItem.icon;
  return <NavItemIcon className={iconClass} strokeWidth={1.8} />;
}

/** The item's `badgeSlot` when configured (e.g. unseen counter), positioned by the hosting bar. */
function AppNavBadge({ navItem, isActive, className }: { navItem: NavItem; isActive: boolean; className?: string }) {
  if (!navItem.badgeSlot) return null;
  const BadgeSlot = navItem.badgeSlot;
  return <BadgeSlot isActive={isActive} className={className} />;
}

/**
 * App sidebar nav button.
 */
export function NavButton({ navItem, isActive, isCollapsed, onClick }: NavButtonProps) {
  const { t } = useTranslation();
  const buttonRef = useRef<HTMLButtonElement>(null);

  const showTooltip = isCollapsed || !hasSidebarTextLabels;

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
        <AppNavBadge navItem={navItem} isActive={isActive} className="top-2 left-8" />
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
      <AppNavBadge navItem={navItem} isActive={isActive} className="top-1 right-1" />
    </button>
  );
}
