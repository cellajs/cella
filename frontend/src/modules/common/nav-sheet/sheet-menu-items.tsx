import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { cn } from '~/lib/utils';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import { type UserMenu, UserRole } from '~/types';
import { type MenuItem, sortMenuItemById } from './sheet-menu-section';
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
          submenu ? 'my-2 ml-2 h-12 w-11/12' : 'my-1 h-14 w-full'
        } flex cursor-pointer items-start justify-start space-x-2 rounded p-0 focus:outline-none ring-2 ring-inset ring-transparent focus:ring-foreground hover:bg-accent/50 hover:text-accent-foreground`,
        className,
      )}
      onClick={handleClick}
      aria-label={item.name}
      to={type === 'ORGANIZATION' ? '/$idOrSlug' : `/${type.toLowerCase()}/$idOrSlug`}
      params={{ idOrSlug: item.slug }}
      activeProps={{ className: 'bg-accent/50 text-accent-foreground ring-primary/50 text-primary focus:ring-primary' }}
    >
      <AvatarWrap className={`${submenu ? 'm-1 h-8 w-8' : 'm-2'} items-center`} type={type} id={item.id} name={item.name} url={item.thumbnailUrl} />
      <div className={`truncate ${submenu ? '' : 'p-2 pl-0'} flex flex-col justify-center text-left`}>
        <div className={`max-sm:pt-2 truncate ${submenu ? 'text-sm' : 'text-base'} leading-5`}>{item.name}</div>
        <div className={`max-sm:hidden text-muted-foreground ${submenu ? 'text-xs' : 'text-sm'} font-light`}>
          {searchResults && <span className="inline transition-all duration-500 ease-in-out group-hover:hidden ">{t(type.toLowerCase())}</span>}
          {item.role && <span className="hidden transition-all duration-500 ease-in-out group-hover:inline ">{UserRole[item.role]}</span>}
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
    .sort((a, b) => sortMenuItemById(a, b, submenu && a.workspaceId ? submenuItemsOrder[a.workspaceId] : activeItemsOrder[sectionType]));

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
