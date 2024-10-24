import { Link, useParams } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import { Button } from '~/modules/ui/button';
import { getEntityPath } from '~/nav-config';
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
  // TODO because cella doesnt have a product entity, we remove orgIdOrSlug here.
  // TODO an attachments crud with views will be added to cella, so we can add the orgIdOrSlug back
  const { idOrSlug, path } = useMemo(() => getEntityPath(item), [item]);

  // TODO use tailwind conditional classes
  return (
    <Link
      resetScroll={false}
      className={cn(
        `group flex ${
          !item.submenu && !searchResults ? 'h-12 relative menu-item-sub' : 'h-14'
        } w-full flex my-1 cursor-pointer items-start justify-start space-x-1 rounded p-0 focus:outline-none ring-2 ring-inset ring-transparent focus:ring-foreground hover:bg-accent/50 hover:text-accent-foreground`,
        className,
        isActive && 'ring-transparent bg-accent',
      )}
      aria-label={item.name}
      to={path}
      params={{ idOrSlug }}
    >
      <AvatarWrap
        className={`${!item.submenu && !searchResults ? 'my-2 mx-3 h-8 w-8 text-xs' : 'm-2'} z-[1] items-center`}
        type={item.entity}
        id={item.id}
        name={item.name}
        url={item.thumbnailUrl}
      />
      <div className="truncate grow py-2 flex flex-col justify-center pr-2 text-left">
        <div
          className={`truncate ${!item.submenu && !searchResults ? 'max-sm:pt-1.5 text-sm sm:-mb-1 sm:-mt-0.5' : 'max-sm:pt-2.5 text-base'} leading-5`}
        >
          {item.name}
        </div>
        <div className={`max-sm:hidden text-muted-foreground ${!item.submenu && !searchResults ? 'text-xs mt-0.5' : 'text-sm'} font-light`}>
          {searchResults && <span className="inline transition-all duration-500 ease-in-out group-hover:hidden ">{t(item.entity)}</span>}
          <span className="hidden transition-all duration-500 ease-in-out group-hover:inline ">
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
  searchResults?: boolean;
  type: ContextEntity;
}

export const SheetMenuItems = ({ data, type, shownOption, createDialog, className, searchResults }: SheetMenuItemsProps) => {
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
    const filteredItems = data.filter((item) => (shownOption === 'archived' ? item.membership.archived : !item.membership.archived));
    return (
      <>
        {filteredItems.map((item) => (
          <div key={item.id}>
            <SheetMenuItem item={item} className={className} searchResults={searchResults} />
            {!item.membership.archived && item.submenu && !!item.submenu.length && !hideSubmenu && (
              <SheetMenuItems type={item.submenu[0].entity} data={item.submenu} shownOption="unarchive" />
            )}
          </div>
        ))}
      </>
    );
  };

  return data.length === 0 ? renderNoItems() : renderItems();
};
