import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { cn } from '~/lib/utils';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import { type Page, UserRole } from '~/types';

interface SheetMenuItemProps {
  item: Page;
  menuItemClick: () => void;
  className?: string;
  searchResults?: boolean;
}

export const SheetMenuItem = ({ item, menuItemClick, className, searchResults }: SheetMenuItemProps) => {
  const { t } = useTranslation();
  return (
    <Link
      resetScroll={false}
      className={cn(
        'group mb-1 sm:max-w-[18rem] font-light flex h-14 w-full cursor-pointer items-start justify-start space-x-2 rounded p-0 transition duration-300 focus:outline-none ring-1 ring-inset ring-transparent focus:ring-foreground hover:bg-accent/50 hover:text-accent-foreground',
        className,
      )}
      onClick={menuItemClick}
      aria-label={item.name}
      to={item.type === 'ORGANIZATION' ? '/$idOrSlug' : `/${item.type.toLowerCase()}/$idOrSlug`}
      params={{ idOrSlug: item.slug }}
      activeProps={{ className: 'bg-accent/50 text-accent-foreground ring-primary/50 text-primary focus:ring-primary' }}
    >
      <AvatarWrap className="m-2" type="ORGANIZATION" id={item.id} name={item.name} url={item.thumbnailUrl} />
      <div className="truncate p-2 pl-0 flex flex-col justify-center text-left">
        <div className="max-sm:pt-2 truncate leading-5">{item.name}</div>
        <div className="max-sm:hidden text-muted-foreground text-sm font-light">
          {searchResults && <span className="inline transition-all duration-500 ease-in-out group-hover:hidden ">{t(item.type.toLowerCase())}</span>}
          {item.role && <span className="hidden transition-all duration-500 ease-in-out group-hover:inline ">{UserRole[item.role]}</span>}
        </div>
      </div>
    </Link>
  );
};

SheetMenuItem.displayName = 'SheetMenuItem';
