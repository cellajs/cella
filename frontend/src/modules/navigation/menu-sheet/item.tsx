import { onlineManager } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { LucideIcon } from 'lucide-react';
import { BellOffIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import { toaster } from '~/modules/common/toaster/service';
import type { UserMenuItem } from '~/modules/me/types';
import { seenGroupingContextTypes } from '~/modules/seen/helpers';
import { useUnseenCount } from '~/modules/seen/use-unseen-count';
import { getContextEntityRoute } from '~/routes-resolver';
import { useNavigationStore } from '~/store/navigation';
import { useUIStore } from '~/store/ui';
import { cn } from '~/utils/cn';

interface MenuSheetItemProps {
  item: UserMenuItem;
  icon?: LucideIcon;
  className?: string;
  searchResults?: boolean;
}

export const MenuSheetItem = ({ item, icon: Icon, className, searchResults }: MenuSheetItemProps) => {
  const { t } = useTranslation();

  const isOnline = onlineManager.isOnline();
  const offlineAccess = useUIStore((state) => state.offlineAccess);
  const detailedMenu = useNavigationStore((state) => state.detailedMenu);

  const canAccess = offlineAccess ? (isOnline ? true : !item.membership.archived) : true;
  const isSubitem = !searchResults && !item.submenu;

  // Unseen count — shown on grouping contexts (direct) and their parents (aggregated from submenu).
  // When detailedMenu is on, sub-items show their own badges so skip parent-level aggregation.
  let contextIds: string | string[] | undefined;
  if (seenGroupingContextTypes.has(item.entityType)) contextIds = item.id;
  else if (!detailedMenu && item.submenu?.length) contextIds = item.submenu.map((sub) => sub.id);
  const unseenCount = useUnseenCount(contextIds);
  const showBadge = unseenCount > 0 && !item.membership.muted;

  // Build route path for the entity
  const { to, params, search } = getContextEntityRoute(item, isSubitem);

  return (
    <Link
      disabled={!canAccess}
      onClick={() => {
        if (!canAccess) toaster(t('common:show_archived.offline.text'), 'warning');
      }}
      data-subitem={isSubitem}
      aria-label={item.name}
      draggable="false"
      to={to}
      params={params}
      search={search}
      resetScroll={false}
      activeOptions={{ exact: false, includeHash: false, includeSearch: isSubitem }}
      activeProps={{ 'data-link-active': true }}
      className={cn(
        'relative group/menuItem h-12 w-full flex items-start justify-start space-x-1 rounded-sm p-0 focus:outline-hidden ring-2 ring-inset ring-transparent focus-visible:ring-foreground sm:hover:bg-accent/30 sm:hover:text-accent-foreground data-[subitem=true]:h-10 ',
        'data-[link-active=true]:ring-transparent data-[link-active=true]:focus-visible:ring-foreground',
        className,
      )}
    >
      <span className="absolute left-0 top-3 h-[calc(100%-1.5rem)] w-1 rounded-lg bg-primary transition-opacity opacity-0 group-data-[link-active=true]/menuItem:opacity-100" />
      <span className="relative z-1 shrink-0 bg-card rounded-full m-2 mx-3 group-data-[subitem=true]/menuItem:my-2 group-data-[subitem=true]/menuItem:mx-4 size-8 group-data-[subitem=true]/menuItem:size-6">
        <AvatarWrap
          className="items-center text-sm bg-card group-hover/menuItem:font-bold group-data-[subitem=true]/menuItem:text-xs size-8 group-data-[subitem=true]/menuItem:size-6 sm:opacity-80 group-hover/menuItem:opacity-100 group-data-[link-active=true]/menuItem:opacity-100"
          type={item.entityType}
          id={item.id}
          icon={Icon}
          name={item.name}
          url={item.thumbnailUrl}
        />
        {item.membership.muted && (
          <span className="absolute bottom-0 right-0 flex items-center justify-center rounded-tl-lg rounded-br-none rounded-tr-none rounded-bl-none bg-card size-3.5 opacity-80">
            <BellOffIcon size={10} strokeWidth={2} />
          </span>
        )}
      </span>
      <div className="truncate grow flex flex-col justify-center pr-2 text-left group-data-[subitem=true]/menuItem:pl-0 sm:opacity-80 group-hover/menuItem:opacity-100 group-data-[link-active=true]/menuItem:opacity-100">
        <div
          className={cn(
            'truncate leading-5 transition-spacing text-md group-hover/menuItem:delay-300 pt-1 duration-100 ease-in-out',
            !searchResults && 'pt-3.5 group-data-[subitem=true]/menuItem:pt-2',
            searchResults
              ? ''
              : isSubitem
                ? 'sm:group-hover/menuItem:pt-[0.06rem]!'
                : 'sm:group-hover/menuItem:pt-[0.3rem]!',
            'group-data-[subitem=true]/menuItem:text-sm group-data-[subitem=true]/menuItem:font-light',
          )}
        >
          {item.name}
        </div>
        <div className="text-muted-foreground text-xs">
          {searchResults && (
            <span>
              {t(item.entityType, { ns: ['app', 'common'] })}
              <span className="transition-opacity duration-100 ease-in-out opacity-0 group-hover/menuItem:delay-300 sm:group-hover/menuItem:opacity-100 mx-2">
                ·
              </span>
            </span>
          )}
          <span className="opacity-0 transition-opacity duration-100 ease-in-out group-hover/menuItem:delay-300 absolute sm:group-hover/menuItem:opacity-100">
            {item.submenu?.length
              ? `${item.submenu?.length} ${t(item.submenu?.length > 1 ? item.submenu[0].entityType : item.submenu[0].entityType, { ns: ['app', 'common'] }).toLowerCase()}`
              : item.membership.role
                ? t(item.membership.role, { ns: ['app', 'common'] })
                : ''}
          </span>
        </div>
      </div>
      {showBadge && (
        <span className="shrink-0 self-center mr-3 min-w-4 h-4 flex items-center justify-center rounded-full bg-background text-primary text-[0.6rem] font-bold px-1 leading-none">
          {unseenCount > 99 ? '99+' : unseenCount}
        </span>
      )}
    </Link>
  );
};
