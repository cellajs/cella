import { onlineManager } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import { toaster } from '~/modules/common/toaster';
import type { UserMenuItem } from '~/modules/me/types';
import { getEntityRoute } from '~/nav-config';
import { useUIStore } from '~/store/ui';
import { cn } from '~/utils/cn';

interface MenuSheetItemProps {
  item: UserMenuItem;
  className?: string;
  searchResults?: boolean;
}

export const MenuSheetItem = ({ item, className, searchResults }: MenuSheetItemProps) => {
  const { t } = useTranslation();

  // Build route path for the entity
  const { to, params, search } = useMemo(() => getEntityRoute(item), [item]);

  const isOnline = onlineManager.isOnline();
  const offlineAccess = useUIStore((state) => state.offlineAccess);

  const canAccess = offlineAccess ? (isOnline ? true : !item.membership.archived) : true;
  const isSubitem = !searchResults && !item.submenu;

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
      activeOptions={{ exact: isSubitem, includeHash: false, includeSearch: isSubitem }}
      activeProps={{ 'data-link-active': true }}
      className={cn(
        'relative group/menuItem h-12 w-full flex items-start justify-start space-x-1 rounded p-0 focus:outline-hidden ring-2 ring-inset ring-transparent focus-visible:ring-foreground sm:hover:bg-accent/30 sm:hover:text-accent-foreground data-[subitem=true]:h-10 ',
        'data-[link-active=true]:ring-transparent',
        className,
      )}
    >
      <AvatarWrap
        className="z-1 items-center m-2 mx-3 group-data-[subitem=true]/menuItem:my-2 group-data-[subitem=true]/menuItem:mx-4 group-data-[subitem=true]/menuItem:text-xs h-8 w-8 group-data-[subitem=true]/menuItem:h-6 group-data-[subitem=true]/menuItem:w-6"
        type={item.entity}
        id={item.id}
        name={item.name}
        url={item.thumbnailUrl}
      />
      <div className="truncate grow flex flex-col justify-center pr-2 text-left group-data-[subitem=true]/menuItem:pl-0">
        <div
          className={`truncate leading-5 transition-all text-base group-hover/menuItem:delay-300 pt-1.5 duration-200 ease-in-out ${!searchResults && 'pt-3.5 group-data-[subitem=true]/menuItem:pt-3'} sm:group-hover/menuItem:pt-1.5! group-data-[subitem=true]/menuItem:text-sm group-data-[subitem=true]/menuItem:leading-4`}
        >
          {item.name}
          <span className="absolute left-0 top-3 h-[calc(100%-1.5rem)] w-1 rounded-lg bg-primary transition-opacity opacity-0 group-data-[link-active=true]/menuItem:opacity-100" />
        </div>
        <div className="text-muted-foreground text-xs font-light sm:group-data-[subitem=true]/menuItem:leading-3">
          {searchResults && (
            <span className="absolute transition-opacity duration-200 delay-200 ease-in-out sm:group-hover/menuItem:opacity-0">
              {t(`app:${item.entity}`)}
            </span>
          )}
          <span className="absolute opacity-0 transition-opacity duration-200 ease-in-out group-hover/menuItem:delay-300 sm:group-hover/menuItem:opacity-100">
            {item.submenu?.length
              ? `${item.submenu?.length} ${t(`app:${item.submenu?.length > 1 ? `${item.submenu[0].entity}s` : item.submenu[0].entity}`).toLowerCase()}`
              : item.membership.role
                ? t(item.membership.role)
                : ''}
          </span>
        </div>
      </div>
    </Link>
  );
};
