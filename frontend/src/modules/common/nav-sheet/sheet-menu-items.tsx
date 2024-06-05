import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { cn, sortById } from '~/lib/utils';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import { type UserMenu, UserRole } from '~/types';
import type { MenuItem } from './sheet-menu-section';
import { Button } from '~/modules/ui/button';
import { Plus } from 'lucide-react';
import { useNavigationStore } from '~/store/navigation';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import type { PageResourceType } from 'backend/types/common';

interface SheetMenuItemProps {
  item: MenuItem;
  type: PageResourceType;
  submenu?: boolean;
  className?: string;
  searchResults?: boolean;
}

export const SheetMenuItem = ({ item, type, className, submenu, searchResults }: SheetMenuItemProps) => {
  const { t } = useTranslation();
  const isSmallScreen = useBreakpoints('max', 'lg');
  const { keepMenuOpen, setSheet } = useNavigationStore();

  const handleClick = () => {
    if (isSmallScreen || !keepMenuOpen) setSheet(null);
  };

  return (
    <Link
      resetScroll={false}
      className={cn(
        `group ${
          submenu ? 'h-12 relative menu-item-sub' : 'h-14'
        } w-full flex my-1 cursor-pointer items-start justify-start space-x-1 rounded p-0 focus:outline-none ring-2 ring-inset ring-transparent focus:ring-foreground hover:bg-accent/50 hover:text-accent-foreground`,
        className,
      )}
      onClick={handleClick}
      aria-label={item.name}
      to={type === 'ORGANIZATION' ? '/$idOrSlug' : '/workspace/$idOrSlug'}
      params={{ idOrSlug: item.workspaceId ? item.workspaceId : item.slug }}
      activeProps={{ className: 'bg-accent/50 text-accent-foreground ring-primary/50 text-primary focus:ring-primary' }}
    >
      <AvatarWrap
        className={`${submenu ? 'my-2 mx-3 h-8 w-8 text-xs' : 'm-2'} z-[1] items-center`}
        type={type}
        id={item.id}
        name={item.name}
        url={item.thumbnailUrl}
      />
      <div className="truncate py-2 flex flex-col justify-center text-left">
        <div className={`truncate ${submenu ? 'max-sm:pt-[6px] text-sm sm:-mb-1 sm:-mt-[2px]' : 'max-sm:pt-[10px] text-base'} leading-5`}>
          {item.name}
        </div>
        <div className={`max-sm:hidden text-muted-foreground ${submenu ? 'text-xs' : 'text-sm'} font-light`}>
          {searchResults && <span className="inline transition-all duration-500 ease-in-out group-hover:hidden ">{t(type.toLowerCase())}</span>}
          <span className="hidden transition-all duration-500 ease-in-out group-hover:inline ">
            {item.submenu ? `${item.submenu?.items.length || 0} ${t('common:projects').toLowerCase()}` : item.role ? UserRole[item.role] : ''}
          </span>
        </div>
      </div>
    </Link>
  );
};

interface SheetMenuItemsProps {
  data: UserMenu[keyof UserMenu];
  shownOption: 'archived' | 'unarchive';
  sectionType: 'organizations' | 'workspaces';
  submenu?: boolean;
  createDialog?: () => void;
  className?: string;
  searchResults?: boolean;
}

export const SheetMenuItems = ({ data, shownOption, sectionType, createDialog, className, submenu, searchResults }: SheetMenuItemsProps) => {
  const { t } = useTranslation();
  const { hideSubmenu, activeItemsOrder, submenuItemsOrder } = useNavigationStore();

  const filteredItems = data.items
    .filter((item) => (shownOption === 'archived' ? item.archived : !item.archived))
    .sort((a, b) => sortById(a.id, b.id, submenu && a.workspaceId ? submenuItemsOrder[a.workspaceId] : activeItemsOrder[sectionType]));

  const renderNoItems = () =>
    data.canCreate && createDialog ? (
      <div className="flex items-center">
        <Button className="w-full" variant="ghost" onClick={createDialog}>
          <Plus size={14} />
          <span className="ml-1 text-sm text-light">
            {t('common:create_your_first')} {t(data.type.toLowerCase()).toLowerCase()}
          </span>
        </Button>
      </div>
    ) : (
      <li className="py-2 text-muted-foreground text-sm text-light text-center">
        {t('common:no_resource_yet', { resource: t(data.type.toLowerCase()).toLowerCase() })}
      </li>
    );

  const renderItems = () =>
    filteredItems.map((item) => (
      <div key={item.id}>
        <SheetMenuItem item={item} type={data.type} submenu={submenu} className={className} searchResults={searchResults} />
        {!item.archived && item.submenu && !!item.submenu.items.length && !hideSubmenu && (
          <SheetMenuItems data={item.submenu} sectionType="workspaces" shownOption="unarchive" submenu />
        )}
      </div>
    ));

  return data.items.length === 0 ? renderNoItems() : renderItems();
};
