import { Link } from '@tanstack/react-router';
import { BellOffIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { getMenuSection } from '~/lib/entity-modules';
import { CountBadge } from '~/modules/common/count-badge';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import { toaster } from '~/modules/common/toaster/toaster';
import type { UserMenuItem } from '~/modules/me/types';
import { canMute, isCompactRow, isSubmenuShown, menuGroup } from '~/modules/navigation/menu-sheet/helpers/menu-rows';
import { useMenuItemUnseenCount } from '~/modules/navigation/menu-sheet/helpers/use-menu-item-unseen-count';
import { RowEndSlot } from '~/modules/navigation/menu-sheet/row-end-slot';
import { SubmenuConnector } from '~/modules/navigation/menu-sheet/submenu-connector';
import { closeNavSheet } from '~/modules/navigation/nav-sheet';
import { navigationStore } from '~/modules/navigation/navigation-store';
import { getChannelRoute, pageTopHashNav } from '~/utils/channel-route';
import { cn } from '~/utils/cn';
import { tw } from '~/utils/tw';

/** Puts a `size-8` icon and the text after it on the columns of a `MenuSheetItem`, in a row at the menu's own inset: `px-3`, `size-8` and `gap-4` match the item's `mx-3 size-8` avatar box and `gap-1`. */
export const menuColumnsClass = tw('gap-4 px-3');

interface MenuSheetItemProps {
  item: UserMenuItem;
  /** A submenu row: smaller, joined to its parent by a connector. */
  isSubitem: boolean;
  /** Its avatar rests grey until hovered or focused. */
  isResting?: boolean;
}

export function MenuSheetItem({ item, isSubitem, isResting = false }: MenuSheetItemProps) {
  const { t } = useTranslation();

  const isOnline = useOnlineManager();

  const canAccess = isOnline || !item.membership.hidden;
  const isInActiveGroup = menuGroup(item) === 'active';

  const section = getMenuSection(item.entityType);
  const Icon = section?.icon;
  const isCompact = isCompactRow(item.entityType, isSubitem);

  const hasSubmenu = isSubmenuShown(item);
  const unseenCount = useMenuItemUnseenCount(item, hasSubmenu);
  const mark = section?.rowMark?.(item, isCompact);
  const isMuted = item.membership.muted && canMute(item);
  const marks = [mark && t(mark.label), isMuted && t('c:muted')].filter(Boolean);

  return (
    <Link
      disabled={!canAccess}
      onClick={() => {
        if (!canAccess) return toaster.warning(t('c:show_hidden.offline.text'));
        // A press on the open page's own row changes no path, which the route listener that closes sheets never sees
        if (!navigationStore.getState().keepNavOpen) closeNavSheet();
      }}
      data-compact={isCompact}
      data-resting={isResting}
      aria-label={marks.length ? `${item.name} (${marks.join(', ')})` : item.name}
      draggable={false}
      {...getChannelRoute(item)}
      {...pageTopHashNav}
      resetScroll={false}
      activeOptions={{ exact: false, includeHash: false, includeSearch: false }}
      activeProps={{ 'data-link-active': true }}
      className="group/menu-sheet-item group-not-has-[:is(a,button):not([data-link-active]):hover]/menu-sheet:data-[link-active=true]:bg-hover standalone:[-webkit-touch-callout:none] focus-effect focus-inset active:bg-accent sm:hover:bg-hover sm:hover:text-foreground relative flex h-12 w-full items-center gap-1 rounded-sm select-none data-[compact=true]:h-10"
    >
      <span className="bg-primary absolute inset-y-3 left-0 w-1 rounded-lg opacity-0 transition-opacity group-data-[link-active=true]/menu-sheet-item:opacity-100" />
      {/* Every avatar gap is 1rem: half below the row above, half above this avatar */}
      {isSubitem && isInActiveGroup && <SubmenuConnector />}
      <span className="relative mx-3 my-2 size-8 shrink-0 group-data-[compact=true]/menu-sheet-item:mx-4 group-data-[compact=true]/menu-sheet-item:size-6">
        <EntityAvatar
          className={cn(
            'bg-card pointer-fine:group-[[data-resting=true]:not(:hover,:focus-visible)]/menu-sheet-item:resting-avatar pointer-coarse:group-[[data-resting=true]:not(:focus-visible)]/menu-sheet-item:resting-avatar size-8 group-hover/menu-sheet-item:opacity-100 group-data-[compact=true]/menu-sheet-item:size-6 group-data-[link-active=true]/menu-sheet-item:opacity-100 sm:opacity-80',
            Icon && 'bg-transparent shadow-none',
          )}
          type={item.entityType}
          id={item.id}
          icon={Icon}
          name={item.name}
          url={item.thumbnailUrl}
        />
        {mark?.badge}
      </span>
      <span className="text-md group-data-[compact=true]/menu-sheet-item:text-foreground-soft group-[[data-compact=true][data-link-active=true]]/menu-sheet-item:text-foreground grow truncate pr-2 leading-5 font-medium group-data-[compact=true]/menu-sheet-item:text-sm group-data-[compact=true]/menu-sheet-item:font-normal group-[[data-compact=true][data-link-active=true]]/menu-sheet-item:font-medium">
        {item.name}
      </span>
      {isMuted && (
        <RowEndSlot className="mr-3">
          <BellOffIcon aria-hidden className="text-faint-foreground size-3.5 shrink-0" />
        </RowEndSlot>
      )}
      {unseenCount > 0 && (
        <RowEndSlot className="mr-3">
          <CountBadge count={unseenCount} variant={isInActiveGroup ? 'primary' : 'muted'} className="shrink-0" />
        </RowEndSlot>
      )}
    </Link>
  );
}
