import { onlineManager } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { showToast } from '~/lib/toasts';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import { Button } from '~/modules/ui/button';
import { getEntityRoute } from '~/nav-config';
import { useGeneralStore } from '~/store/general';
import { useNavigationStore } from '~/store/navigation';
import type { ContextEntity, UserMenuItem } from '~/types/common';
import { cn } from '~/utils/cn';

interface SheetMenuItemProps {
  item: UserMenuItem;
  className?: string;
  searchResults?: boolean;
}

export const SheetMenuItem = ({ item, className, searchResults }: SheetMenuItemProps) => {
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
        if (!canAccess) showToast(t('common:show_archived.offline.text'), 'warning');
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
        <div
          className="max-sm:hidden text-muted-foreground text-sm font-light
          group-data-[subitem=true]/menuItem:sm:text-xs
          "
        >
          {searchResults && (
            <span className="absolute transition-opacity duration-200 delay-200 ease-in-out group-hover/menuItem:sm:opacity-0">
              {t(`app:${item.entity}`)}
            </span>
          )}
          <span className="opacity-0 transition-opacity duration-200 ease-in-out group-hover/menuItem:delay-300 group-hover/menuItem:sm:opacity-100">
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

interface SheetMenuItemsProps {
  data: UserMenuItem[];
  shownOption: 'archived' | 'unarchive';
  createDialog?: () => void;
  className?: string;
  type: ContextEntity;
}

export const SheetMenuItems = ({ data, type, shownOption, createDialog, className }: SheetMenuItemsProps) => {
  const { t } = useTranslation();
  const { hideSubmenu } = useNavigationStore();

  const renderNoItems = () =>
    createDialog ? (
      <div className="flex items-center">
        <Button className="w-full" variant="ghost" onClick={createDialog}>
          <Plus size={14} />
          <span className="ml-1 text-sm text-light">
            {t('common:create_your_first')} {t(type).toLowerCase()}
          </span>
        </Button>
      </div>
    ) : (
      <li className="py-2 text-muted-foreground text-sm text-light text-center">
        {t('common:no_resource_yet', { resource: t(type).toLowerCase() })}
      </li>
    );

  const renderItems = () => {
    const filteredItems = data
      .filter((item) => (shownOption === 'archived' ? item.membership.archived : !item.membership.archived))
      .sort((a, b) => a.membership.order - b.membership.order);
    return (
      <>
        {filteredItems.map((item) => (
          <li className={item.submenu?.length && !hideSubmenu ? 'relative submenu-section' : ''} key={item.id}>
            <SheetMenuItem item={item} className={className} />
            {!item.membership.archived && !!item.submenu?.length && !hideSubmenu && (
              <SheetMenuItems type={item.submenu[0].entity} data={item.submenu} shownOption="unarchive" />
            )}
          </li>
        ))}
      </>
    );
  };

  return data.length === 0 ? renderNoItems() : renderItems();
};
