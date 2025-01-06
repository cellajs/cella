import { onlineManager } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { createToast } from '~/lib/toasts';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import { getEntityRoute } from '~/nav-config';
import { useGeneralStore } from '~/store/general';
import type { UserMenuItem } from '~/types/common';
import { cn } from '~/utils/cn';

interface MenuSheetItemProps {
  item: UserMenuItem;
  className?: string;
  searchResults?: boolean;
}

export const MenuSheetItem = ({ item, className, searchResults }: MenuSheetItemProps) => {
  const { t } = useTranslation();

  //Strict false is needed because sheet menu can be open at any route
  const currentIdOrSlug = useParams({ strict: false, select: (p) => p.idOrSlug });
  const isActive = currentIdOrSlug === item.slug || currentIdOrSlug === item.id;

  // Build route path for the entity
  const { params, path } = useMemo(() => getEntityRoute(item), [item]);

  const isOnline = onlineManager.isOnline();
  const offlineAccess = useGeneralStore((state) => state.offlineAccess);

  const canAccess = offlineAccess ? (isOnline ? true : !item.membership.archived) : true;

  return (
    <Link
      disabled={!canAccess}
      onClick={() => {
        if (!canAccess) createToast(t('common:show_archived.offline.text'), 'warning');
      }}
      data-subitem={!searchResults && !item.submenu}
      data-active={isActive}
      resetScroll={false}
      className={cn(
        'group/menuItem h-14 w-full flex my-1 cursor-pointer items-start justify-start space-x-1 rounded p-0 focus:outline-none ring-2 ring-inset ring-transparent focus-visible:ring-foreground hover:bg-accent/50 hover:text-accent-foreground data-[subitem=true]:h-12 data-[active=true]:ring-transparent data-[active=true]:bg-accent',
        className,
      )}
      aria-label={item.name}
      to={path}
      params={params}
    >
      <AvatarWrap
        className="z-[1] items-center m-2 group-data-[subitem=true]/menuItem:my-2 group-data-[subitem=true]/menuItem:mx-3 group-data-[subitem=true]/menuItem:text-xs group-data-[subitem=true]/menuItem:h-8 group-data-[subitem=true]/menuItem:w-8"
        type={item.entity}
        id={item.id}
        name={item.name}
        url={item.thumbnailUrl}
      />
      <div className="truncate grow py-2 flex flex-col justify-center pr-2 text-left">
        <div
          className={`truncate leading-5 transition-all group-hover/menuItem:delay-300 duration-200 ease-in-out ${!searchResults && 'pt-2.5'} group-hover/menuItem:sm:!pt-0 text-base group-data-[subitem=true]/menuItem:text-sm
            group-data-[subitem=true]/menuItem:sm:-my-0.5 group-data-[subitem=true]/menuItem:sm:pt-1`}
        >
          {item.name}
        </div>
        <div className="text-muted-foreground text-sm font-light group-data-[subitem=true]/menuItem:sm:text-xs">
          {searchResults && (
            <span className="absolute transition-opacity duration-200 delay-200 ease-in-out sm:group-hover/menuItem:opacity-0">
              {t(`app:${item.entity}`)}
            </span>
          )}
          <span className="absolute opacity-0 transition-opacity duration-200 ease-in-out group-hover/menuItem:delay-300 group-hover/menuItem:sm:opacity-100">
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
