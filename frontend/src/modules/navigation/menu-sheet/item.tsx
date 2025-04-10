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
  const { params, path, search, activeOptions } = useMemo(() => getEntityRoute(item), [item]);

  const isOnline = onlineManager.isOnline();
  const offlineAccess = useUIStore((state) => state.offlineAccess);

  const canAccess = offlineAccess ? (isOnline ? true : !item.membership.archived) : true;

  return (
    <Link
      disabled={!canAccess}
      onClick={() => {
        if (!canAccess) toaster(t('common:show_archived.offline.text'), 'warning');
      }}
      data-subitem={!searchResults && !item.submenu}
      aria-label={item.name}
      draggable="false"
      to={path}
      params={params}
      search={search}
      resetScroll={false}
      activeOptions={activeOptions}
      activeProps={{ 'data-active': true }}
      className={cn(
        'relative group/menuItem h-12 w-full flex items-start justify-start space-x-1 rounded p-0 focus:outline-hidden ring-2 ring-inset ring-transparent focus-visible:ring-foreground sm:hover:bg-accent/30 sm:hover:text-accent-foreground data-[subitem=true]:h-10 data-[active=true]:ring-transparent data-[active=true]:bg-accent/50',
        className,
      )}
    >
      <AvatarWrap
        className="z-1 items-center m-1 mr-3 group-data-[subitem=true]/menuItem:my-1.5 group-data-[subitem=true]/menuItem:mx-2.5 group-data-[subitem=true]/menuItem:text-xs group-data-[subitem=true]/menuItem:h-7 group-data-[subitem=true]/menuItem:w-7"
        type={item.entity}
        id={item.id}
        name={item.name}
        url={item.thumbnailUrl}
      />
      <div className="truncate grow flex flex-col justify-center pr-2 text-left group-data-[subitem=true]/menuItem:pl-2">
        <div
          className={`truncate leading-5 transition-all text-base group-hover/menuItem:delay-300 pt-1.5 duration-200 ease-in-out ${!searchResults && 'pt-3.5 group-data-[subitem=true]/menuItem:pt-3'} sm:group-hover/menuItem:pt-1.5! group-data-[subitem=true]/menuItem:text-sm group-data-[subitem=true]/menuItem:leading-4`}
        >
          {item.name}
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
