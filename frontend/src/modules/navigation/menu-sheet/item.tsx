import { onlineManager } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { BellOffIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import type { IconComponent } from '~/modules/common/icons/types';
import { toaster } from '~/modules/common/toaster/toaster';
import type { UserMenuItem } from '~/modules/me/types';
import { useNavigationStore } from '~/modules/navigation/navigation-store';
import { seenGroupingChannelTypes } from '~/modules/seen/helpers';
import { useUnseenCount } from '~/modules/seen/use-unseen-count';
import { useUIStore } from '~/modules/ui/ui-store';
import { getChannelRoute, pageTopHashNav } from '~/utils/channel-route';
import { cn } from '~/utils/cn';

interface MenuSheetItemProps {
  item: UserMenuItem;
  icon?: IconComponent;
  className?: string;
}

export function MenuSheetItem({ item, icon: Icon, className }: MenuSheetItemProps) {
  const { t } = useTranslation();

  const isOnline = onlineManager.isOnline();
  const offlineAccess = useUIStore((state) => state.offlineAccess);
  const detailedMenu = useNavigationStore((state) => state.detailedMenu);

  const canAccess = offlineAccess ? (isOnline ? true : !item.membership.archived) : true;
  const isSubitem = !item.submenu;

  // Own count for grouping channels, plus submenu aggregation when sub-rows don't render their own badges
  // (detailedMenu off, or an archived item whose submenu is never rendered).
  const aggregateSubmenu = !!item.submenu?.length && (!detailedMenu || !!item.membership.archived);
  const channelIds = [
    ...(seenGroupingChannelTypes.has(item.entityType) ? [item.id] : []),
    ...(aggregateSubmenu && item.submenu ? item.submenu.map((sub) => sub.id) : []),
  ];
  const unseenCount = useUnseenCount(channelIds);
  const showBadge = unseenCount > 0 && !item.membership.muted;

  const { to, params, search } = getChannelRoute(item, isSubitem);

  return (
    <Link
      disabled={!canAccess}
      onClick={() => {
        if (!canAccess) toaster.warning(t('c:show_archived.offline.text'));
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
      className={cn(
        'group/menu-sheet-item relative flex h-12 w-full items-start justify-start gap-1 rounded-sm p-0 ring-2 ring-transparent ring-inset focus:outline-hidden focus-visible:ring-foreground data-[subitem=true]:h-10 sm:hover:bg-accent/30 sm:hover:text-accent-foreground',
        'data-[link-active=true]:ring-transparent data-[link-active=true]:focus-visible:ring-foreground',
        className,
      )}
    >
      <span className="absolute top-3 left-0 h-[calc(100%-1.5rem)] w-1 rounded-lg bg-primary opacity-0 transition-opacity group-data-[link-active=true]/menu-sheet-item:opacity-100" />
      <span className="relative z-1 m-2 mx-3 size-8 shrink-0 rounded-full bg-card group-data-[subitem=true]/menu-sheet-item:mx-4 group-data-[subitem=true]/menu-sheet-item:my-2 group-data-[subitem=true]/menu-sheet-item:size-6">
        <EntityAvatar
          className="size-8 items-center bg-card text-sm group-hover/menu-sheet-item:font-bold group-hover/menu-sheet-item:opacity-100 group-data-[subitem=true]/menu-sheet-item:size-6 group-data-[subitem=true]/menu-sheet-item:text-xs group-data-[link-active=true]/menu-sheet-item:opacity-100 sm:opacity-80"
          type={item.entityType}
          id={item.id}
          icon={Icon}
          name={item.name}
          url={item.thumbnailUrl}
        />
        {item.membership.muted && (
          <span className="absolute right-0 bottom-0 flex size-3.5 items-center justify-center rounded-tl-lg rounded-tr-none rounded-br-none rounded-bl-none bg-card opacity-80">
            <BellOffIcon className="size-2.5" strokeWidth={2} />
          </span>
        )}
      </span>
      <div className="flex grow flex-col justify-center truncate pr-2 text-left group-hover/menu-sheet-item:opacity-100 group-data-[subitem=true]/menu-sheet-item:pl-0 group-data-[link-active=true]/menu-sheet-item:opacity-100 sm:opacity-80">
        <div
          className={cn(
            'truncate pt-1 text-md leading-5 transition-spacing duration-100 ease-in-out group-hover/menu-sheet-item:delay-300',
            'pt-3.5 group-data-[subitem=true]/menu-sheet-item:pt-2',
            isSubitem ? 'sm:group-hover/menu-sheet-item:pt-[0.06rem]!' : 'sm:group-hover/menu-sheet-item:pt-[0.3rem]!',
            'group-data-[link-active=true]/menu-sheet-item:font-medium group-data-[subitem=true]/menu-sheet-item:text-sm',
          )}
        >
          {item.name}
        </div>
        <div className="pointer-events-none text-muted-foreground text-xs">
          <span className="absolute opacity-0 transition-opacity duration-100 ease-in-out group-hover/menu-sheet-item:delay-300 sm:group-hover/menu-sheet-item:opacity-100">
            {item.membership.role ? t(item.membership.role) : ''}
            {!detailedMenu && item.submenu?.length
              ? `${item.membership.role ? ' · ' : ''}${item.submenu.length} ${t(item.submenu[0].entityType, { count: item.submenu.length }).toLowerCase()}`
              : ''}
          </span>
        </div>
      </div>
      {showBadge && (
        <span className="mr-3 flex h-4 min-w-4 shrink-0 items-center justify-center self-center rounded-full bg-primary px-1 font-bold text-[0.6rem] text-primary-foreground leading-none">
          {unseenCount > 99 ? '99+' : unseenCount}
        </span>
      )}
    </Link>
  );
}
