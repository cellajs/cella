import { Link } from '@tanstack/react-router';
import { BellOffIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { CountBadge } from '~/modules/common/count-badge';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import type { IconComponent } from '~/modules/common/icons/types';
import { toaster } from '~/modules/common/toaster/toaster';
import type { UserMenuItem } from '~/modules/me/types';
import { isSubmenuShown } from '~/modules/navigation/menu-sheet/helpers/is-submenu-shown';
import { useMenuItemUnseenCount } from '~/modules/navigation/menu-sheet/helpers/use-menu-item-unseen-count';
import { SubmenuConnector } from '~/modules/navigation/menu-sheet/submenu-connector';
import { closeNavSheet } from '~/modules/navigation/nav-sheet';
import { navigationStore } from '~/modules/navigation/navigation-store';
import { getChannelRoute, pageTopHashNav } from '~/utils/channel-route';
import { cn } from '~/utils/cn';

interface MenuSheetItemProps {
  item: UserMenuItem;
  /** It is a row of a submenu: a smaller row that may link to its parent's page. */
  isSubitem: boolean;
  icon?: IconComponent;
}

export function MenuSheetItem({ item, isSubitem, icon: Icon }: MenuSheetItemProps) {
  const { t } = useTranslation();

  const isOnline = useOnlineManager();

  const canAccess = isOnline || !item.membership.archived;

  const hasSubmenu = isSubmenuShown(item);
  const unseenCount = useMenuItemUnseenCount(item, hasSubmenu);

  const { to, params, search } = getChannelRoute(item, isSubitem);

  return (
    <Link
      disabled={!canAccess}
      onClick={() => {
        if (!canAccess) return toaster.warning(t('c:show_archived.offline.text'));
        // A subitem may change only the search of the page it is on, which the route listener that closes sheets never sees
        if (!navigationStore.getState().keepNavOpen) closeNavSheet();
      }}
      data-subitem={isSubitem}
      aria-label={item.name}
      draggable={false}
      to={to}
      params={params}
      search={search}
      {...pageTopHashNav}
      resetScroll={false}
      activeOptions={{ exact: false, includeHash: false, includeSearch: isSubitem }}
      activeProps={{ 'data-link-active': true }}
      className="group/menu-sheet-item relative flex h-12 w-full select-none items-start gap-1 rounded-sm ring-2 ring-transparent ring-inset standalone:[-webkit-touch-callout:none] focus:outline-hidden focus-visible:ring-ring active:bg-accent data-[subitem=true]:h-10 sm:hover:bg-accent sm:hover:text-foreground"
    >
      <span className="absolute inset-y-3 left-0 w-1 rounded-lg bg-primary opacity-0 transition-opacity group-data-[link-active=true]/menu-sheet-item:opacity-100" />
      {/* Every avatar gap is 1rem: half below the row above, half above this avatar */}
      {isSubitem && <SubmenuConnector className="-top-2 h-4" />}
      <span className="relative mx-3 my-2 size-8 shrink-0 group-data-[subitem=true]/menu-sheet-item:mx-4 group-data-[subitem=true]/menu-sheet-item:size-6">
        <EntityAvatar
          className={cn(
            'size-8 bg-card group-hover/menu-sheet-item:opacity-100 group-data-[subitem=true]/menu-sheet-item:size-6 group-data-[link-active=true]/menu-sheet-item:opacity-100 sm:opacity-80',
            Icon && 'bg-transparent shadow-none',
          )}
          type={item.entityType}
          id={item.id}
          icon={Icon}
          name={item.name}
          url={item.thumbnailUrl}
        />
        {item.membership.muted && (
          <span className="absolute right-0 bottom-0 flex size-3.5 items-center justify-center rounded-tl-lg bg-card opacity-80">
            <BellOffIcon className="size-2.5" strokeWidth={2} />
          </span>
        )}
      </span>
      <div className="flex grow flex-col justify-center truncate pr-2 text-left">
        <div
          className={cn(
            'truncate pt-3.5 text-md leading-5 transition-spacing duration-100 ease-in-out group-hover/menu-sheet-item:delay-300 group-data-[subitem=true]/menu-sheet-item:pt-2 group-data-[subitem=true]/menu-sheet-item:text-sm sm:group-hover/menu-sheet-item:pt-[0.3rem] sm:group-data-[subitem=true]/menu-sheet-item:group-hover/menu-sheet-item:pt-[0.06rem]',
            isSubitem ? 'group-data-[link-active=true]/menu-sheet-item:font-medium' : 'font-medium',
          )}
        >
          {item.name}
        </div>
        <div className="pointer-events-none text-muted-foreground text-xs">
          <span className="absolute opacity-0 transition-opacity duration-100 ease-in-out group-hover/menu-sheet-item:delay-300 sm:group-hover/menu-sheet-item:opacity-100">
            {item.membership.role ? t(item.membership.role) : ''}
            {!hasSubmenu && item.submenu?.length
              ? `${item.membership.role ? ' · ' : ''}${t('c:resource_count', { count: item.submenu.length, resource: t(item.submenu[0].entityType, { count: item.submenu.length }) })}`
              : ''}
          </span>
        </div>
      </div>
      {unseenCount > 0 && <CountBadge count={unseenCount} className="mr-3 shrink-0 self-center" />}
    </Link>
  );
}
