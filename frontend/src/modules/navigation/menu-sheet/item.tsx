import { Link } from '@tanstack/react-router';
import { BellOffIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { getMenuSection } from '~/lib/entity-modules';
import { CountBadge } from '~/modules/common/count-badge';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import type { IconComponent } from '~/modules/common/icons/types';
import { toaster } from '~/modules/common/toaster/toaster';
import type { UserMenuItem } from '~/modules/me/types';
import { canMute, isSubmenuShown, menuGroup } from '~/modules/navigation/menu-sheet/helpers/menu-rows';
import { useMenuItemUnseenCount } from '~/modules/navigation/menu-sheet/helpers/use-menu-item-unseen-count';
import { SubmenuConnector } from '~/modules/navigation/menu-sheet/submenu-connector';
import { closeNavSheet } from '~/modules/navigation/nav-sheet';
import { navigationStore } from '~/modules/navigation/navigation-store';
import { getChannelRoute, pageTopHashNav } from '~/utils/channel-route';
import { cn } from '~/utils/cn';

interface MenuSheetItemProps {
  item: UserMenuItem;
  /** A submenu row, which may link to its parent's page. */
  isSubitem: boolean;
  /** Its avatar rests grey until hovered or focused. */
  isResting?: boolean;
  icon?: IconComponent;
}

export function MenuSheetItem({ item, isSubitem, isResting = false, icon: Icon }: MenuSheetItemProps) {
  const { t } = useTranslation();

  const isOnline = useOnlineManager();

  const canAccess = isOnline || !item.membership.hidden;
  const isActive = menuGroup(item) === 'active';

  const hasSubmenu = isSubmenuShown(item);
  const unseenCount = useMenuItemUnseenCount(item, hasSubmenu);
  const mark = getMenuSection(item.entityType)?.rowMark?.(item);
  const Mark = mark?.icon;

  return (
    <Link
      disabled={!canAccess}
      onClick={() => {
        if (!canAccess) return toaster.warning(t('c:show_hidden.offline.text'));
        // A subitem may change only the search of the page it is on, which the route listener that closes sheets never sees
        if (!navigationStore.getState().keepNavOpen) closeNavSheet();
      }}
      data-subitem={isSubitem}
      aria-label={mark ? `${item.name} (${t(mark.label)})` : item.name}
      draggable={false}
      // A parent's page holds no place for a hidden or archived sub-row, so it opens its own
      {...getChannelRoute(item, isSubitem && isActive)}
      {...pageTopHashNav}
      resetScroll={false}
      activeOptions={{ exact: false, includeHash: false, includeSearch: isSubitem }}
      activeProps={{ 'data-link-active': true }}
      className="group/menu-sheet-item standalone:[-webkit-touch-callout:none] focus-visible:ring-ring active:bg-accent sm:hover:bg-hover sm:hover:text-foreground relative flex h-12 w-full items-center gap-1 rounded-sm ring-2 ring-transparent select-none ring-inset focus:outline-hidden data-[subitem=true]:h-10"
    >
      <span className="bg-primary absolute inset-y-3 left-0 w-1 rounded-lg opacity-0 transition-opacity group-data-[link-active=true]/menu-sheet-item:opacity-100" />
      {/* Every avatar gap is 1rem: half below the row above, half above this avatar */}
      {isSubitem && isActive && <SubmenuConnector className="-top-2 h-4" />}
      <span className="relative mx-3 my-2 size-8 shrink-0 group-data-[subitem=true]/menu-sheet-item:mx-4 group-data-[subitem=true]/menu-sheet-item:size-6">
        <EntityAvatar
          className={cn(
            'bg-card size-8 group-hover/menu-sheet-item:opacity-100 group-data-[link-active=true]/menu-sheet-item:opacity-100 group-data-[subitem=true]/menu-sheet-item:size-6 sm:opacity-80',
            Icon && 'bg-transparent shadow-none',
            isResting &&
              'pointer-fine:group-[:not(:hover,:focus-visible)]/menu-sheet-item:resting-avatar pointer-coarse:group-[:not(:focus-visible)]/menu-sheet-item:resting-avatar',
          )}
          type={item.entityType}
          id={item.id}
          icon={Icon}
          name={item.name}
          url={item.thumbnailUrl}
        />
        {item.membership.muted && canMute(item) && (
          <span className="bg-card absolute right-0 bottom-0 flex size-3.5 items-center justify-center rounded-tl-lg opacity-80">
            <BellOffIcon className="size-2.5" strokeWidth={2} />
          </span>
        )}
        {Mark && (
          <span className="bg-card absolute bottom-0 left-0 flex size-3.5 items-center justify-center rounded-tr-lg opacity-80">
            <Mark className="size-2.5" strokeWidth={2} />
          </span>
        )}
      </span>
      <span
        className={cn(
          'text-md grow truncate pr-2 leading-5 group-data-[subitem=true]/menu-sheet-item:text-sm',
          isSubitem ? 'group-data-[link-active=true]/menu-sheet-item:font-medium' : 'font-medium',
        )}
      >
        {item.name}
      </span>
      {unseenCount > 0 && <CountBadge count={unseenCount} className="mr-3 shrink-0" />}
    </Link>
  );
}
