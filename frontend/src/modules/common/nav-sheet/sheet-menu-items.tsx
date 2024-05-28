import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { cn } from '~/lib/utils';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import { type UserMenu, UserRole } from '~/types';
import { sortById } from './sheet-menu-section';
import { Button } from '~/modules/ui/button';
import { Plus } from 'lucide-react';
import { useNavigationStore } from '~/store/navigation';
import { useBreakpoints } from '~/hooks/use-breakpoints';

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
  const isSmallScreen = useBreakpoints('max', 'lg');
  const { keepMenuOpen, setSheet } = useNavigationStore();
  const { activeItemsOrder, submenuItemsOrder } = useNavigationStore();

  const items = data.items
    .filter((i) => (shownOption === 'archived' ? i.archived : !i.archived))
    .sort((a, b) => sortById(a, b, submenu && a.workspaceId ? submenuItemsOrder[a.workspaceId] : activeItemsOrder[sectionType]));

  const menuItemClick = () => {
    if (isSmallScreen || !keepMenuOpen) setSheet(null);
  };

  if (data.items.length === 0) {
    return (
      <>
        {data.canCreate && createDialog ? (
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
        )}
      </>
    );
  }

  return items.map((item) => (
    <div key={item.id}>
      <Link
        resetScroll={false}
        className={cn(
          `group ${
            submenu ? 'm-2 h-12' : 'my-1 h-14'
          } sm:max-w-[18rem] flex w-full cursor-pointer items-start justify-start space-x-2 rounded p-0 focus:outline-none ring-2 ring-inset ring-transparent focus:ring-foreground hover:bg-accent/50 hover:text-accent-foreground`,
          className,
        )}
        onClick={menuItemClick}
        aria-label={item.name}
        to={data.type === 'ORGANIZATION' ? '/$idOrSlug' : `/${data.type.toLowerCase()}/$idOrSlug`}
        params={{ idOrSlug: item.slug }}
        activeProps={{ className: 'bg-accent/50 text-accent-foreground ring-primary/50 text-primary focus:ring-primary' }}
      >
        <AvatarWrap className={`${submenu ? 'm-1 h-8 w-8' : 'm-2'}`} type={data.type} id={item.id} name={item.name} url={item.thumbnailUrl} />
        <div className={`truncate ${submenu ? 'p-0' : 'p-2 pl-0'} flex flex-col justify-center text-left`}>
          <div className={`max-sm:pt-2 truncate ${submenu ? 'text-sm' : 'text-base'} leading-5`}>{item.name}</div>
          <div className={`max-sm:hidden text-muted-foreground ${submenu ? 'text-xs' : 'text-sm'} font-light`}>
            {searchResults && (
              <span className="inline transition-all duration-500 ease-in-out group-hover:hidden ">{t(data.type.toLowerCase())}</span>
            )}
            {item.role && <span className="hidden transition-all duration-500 ease-in-out group-hover:inline ">{UserRole[item.role]}</span>}
          </div>
        </div>
      </Link>
      {item.submenu && !!item.submenu.items.length && (
        <SheetMenuItems data={item.submenu} sectionType={'workspaces'} shownOption="unarchive" submenu={true} />
      )}
    </div>
  ));
};
