import { Link } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '~/lib/utils';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import { Button } from '~/modules/ui/button';
import { useNavigationStore } from '~/store/navigation';
import type { ContextEntity, UserMenuItem } from '~/types';

interface SheetMenuItemProps {
  item: UserMenuItem;
  type: ContextEntity;
  mainItemId?: string;
  className?: string;
  searchResults?: boolean;
}

export const SheetMenuItem = ({ item, type, className, mainItemId, searchResults }: SheetMenuItemProps) => {
  const { t } = useTranslation();

  return (
    <Link
      resetScroll={false}
      className={cn(
        `group ${
          mainItemId ? 'h-12 relative menu-item-sub' : 'h-14'
        } w-full flex my-1 cursor-pointer items-start justify-start space-x-1 rounded p-0 focus:outline-none ring-2 ring-inset ring-transparent focus:ring-foreground hover:bg-accent/50 hover:text-accent-foreground`,
        className,
      )}
      aria-label={item.name}
      to={type === 'ORGANIZATION' ? '/$idOrSlug' : '/workspaces/$idOrSlug'}
      params={{ idOrSlug: mainItemId ? mainItemId : item.slug }}
      activeProps={{ className: 'bg-accent/50 text-accent-foreground ring-primary/50 text-primary focus:ring-primary' }}
    >
      <AvatarWrap
        className={`${mainItemId ? 'my-2 mx-3 h-8 w-8 text-xs' : 'm-2'} z-[1] items-center`}
        type={type}
        id={item.id}
        name={item.name}
        url={item.thumbnailUrl}
      />
      <div className="truncate py-2 flex flex-col justify-center text-left">
        <div className={`truncate ${mainItemId ? 'max-sm:pt-1.5 text-sm sm:-mb-1 sm:-mt-0.5' : 'max-sm:pt-2.5 text-base'} leading-5`}>
          {item.name}
        </div>
        <div className={`max-sm:hidden text-muted-foreground ${mainItemId ? 'text-xs mt-0.5' : 'text-sm'} font-light`}>
          {searchResults && <span className="inline transition-all duration-500 ease-in-out group-hover:hidden ">{t(type.toLowerCase())}</span>}
          <span className="hidden transition-all duration-500 ease-in-out group-hover:inline ">
            {/* On new creation cant access role REDO */}
            {item.submenu
              ? `${item.submenu?.length || 0} ${t('common:projects').toLowerCase()}`
              : item.membership.role
                ? t(item.membership.role.toLowerCase())
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
            {t('common:create_your_first')} {t(type.toLowerCase()).toLowerCase()}
          </span>
        </Button>
      </div>
    ) : (
      <li className="py-2 text-muted-foreground text-sm text-light text-center">
        {t('common:no_resource_yet', { resource: t(type.toLowerCase()).toLowerCase() })}
      </li>
    );

  const renderItems = () => {
    const filteredItems = data
      .filter((item) => (shownOption === 'archived' ? item.membership.archived : !item.membership.archived))
      .sort((a, b) => a.membership.order - b.membership.order);
    return (
      <>
        {filteredItems.map((item) => (
          <div key={item.id}>
            <SheetMenuItem item={item} type={type} mainItemId={item.parentId} className={className} searchResults={searchResults} />
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
