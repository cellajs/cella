import { type ReactNode, type Ref, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import type { NavItem, TriggerNavItemFn } from '~/modules/navigation/types';
import { SidebarMenuButton, SidebarMenuItem } from '~/modules/ui/sidebar';
import { cn } from '~/utils/cn';
import { tw } from '~/utils/tw';

const { hasSidebarTextLabels } = appConfig.theme.navigation;

interface NavItemButtonProps {
  navItem: NavItem;
  isActive: boolean;
  isCollapsed: boolean;
  onClick: TriggerNavItemFn;
}

export const navIconStrokeWidth = 1.8;

/** A nav icon's classes; larger below sm, where the bottom bar shows them. */
export const navItemIconClass = tw('size-6 shrink-0 transition-transform group-hover:scale-110 sm:size-5');

function NavItemIcon({ navItem }: { navItem: NavItem }) {
  if (navItem.iconOverride) {
    const IconOverride = navItem.iconOverride;
    return <IconOverride className={navItemIconClass} icon={navItem.icon} />;
  }

  const Icon = navItem.icon;
  return <Icon className={navItemIconClass} strokeWidth={navIconStrokeWidth} />;
}

function NavItemBadge({ navItem, isActive, className }: { navItem: NavItem; isActive: boolean; className?: string }) {
  if (!navItem.badge) return null;
  const ItemBadge = navItem.badge;
  return <ItemBadge isActive={isActive} className={className} />;
}

interface SidebarNavButtonProps {
  label: string;
  isCollapsed: boolean;
  onClick: () => void;
  isActive?: boolean;
  /** Marks the button as the place the page belongs to; the caller draws the cue. */
  isCurrent?: boolean;
  ref?: Ref<HTMLButtonElement>;
  className?: string;
  /** Classes of the list item around the button, e.g. to drop the space below it. */
  itemClassName?: string;
  /** The icon. */
  children: ReactNode;
  badge?: ReactNode;
}

/** A sidebar nav button: tooltip while collapsed or without text labels, and the text label when the theme shows one. */
export function SidebarNavButton({
  label,
  isCollapsed,
  onClick,
  isActive,
  isCurrent,
  ref,
  className,
  itemClassName,
  children,
  badge,
}: SidebarNavButtonProps) {
  const showTooltip = isCollapsed || !hasSidebarTextLabels;

  return (
    <SidebarMenuItem className={cn('flex pb-2', itemClassName)}>
      <SidebarMenuButton
        ref={ref}
        size="lg"
        data-collapsed={isCollapsed}
        tooltip={{ children: label, hidden: !showTooltip }}
        onClick={onClick}
        isActive={isActive}
        aria-current={isCurrent || undefined}
        className={cn(
          'group h-14 justify-center text-sidebar-foreground ring-inset transition-[width] duration-200 ease-linear data-[collapsed=true]:w-16 [&>svg]:size-5',
          className,
        )}
      >
        {children}
        {!hasSidebarTextLabels && <span className="sr-only">{label}</span>}
        {badge}
        {hasSidebarTextLabels && (
          <span className="overflow-hidden whitespace-nowrap pl-1.5 font-medium transition-[opacity,width] duration-200 ease-linear group-data-[collapsed=true]:w-0 group-data-[collapsed=true]:opacity-0">
            {label}
          </span>
        )}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function SidebarNavItemButton({
  navItem,
  isActive,
  isCollapsed,
  onClick,
  itemClassName,
}: NavItemButtonProps & Pick<SidebarNavButtonProps, 'itemClassName'>) {
  const { t } = useTranslation();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const label = t(`c:${navItem.id}`);

  return (
    <SidebarNavButton
      ref={buttonRef}
      label={label}
      isCollapsed={isCollapsed}
      isActive={isActive}
      itemClassName={itemClassName}
      onClick={() => onClick(navItem.id, buttonRef)}
      className="relative"
      badge={<NavItemBadge navItem={navItem} isActive={isActive} className="top-2 left-8" />}
    >
      <NavItemIcon navItem={navItem} />
    </SidebarNavButton>
  );
}

export function BottomBarNavItemButton({ navItem, isActive, onClick }: Omit<NavItemButtonProps, 'isCollapsed'>) {
  const { t } = useTranslation();
  const buttonRef = useRef<HTMLButtonElement>(null);

  return (
    <button
      ref={buttonRef}
      type="button"
      id={`${navItem.id}-nav`}
      data-active={isActive}
      onClick={() => onClick(navItem.id, buttonRef)}
      className="group active:press relative flex size-14 items-center justify-center rounded-md text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:bg-sidebar-accent"
    >
      <NavItemIcon navItem={navItem} />
      <span className="sr-only">{t(`c:${navItem.id}`)}</span>
      <NavItemBadge navItem={navItem} isActive={isActive} className="top-1 right-1" />
    </button>
  );
}
