import { Link } from '@tanstack/react-router';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import { type Page, UserRole } from '~/types';

interface SheetMenuItemProps {
  item: Page;
  menutItemClick: () => void;
}

export const SheetMenuItem = ({ item, menutItemClick }: SheetMenuItemProps) => {
  return (
    <Link
      resetScroll={false}
      className="group mb-1 flex h-14 w-full cursor-pointer items-start justify-start space-x-2 rounded p-0 transition duration-300 focus:outline-none ring-1 ring-inset ring-transparent focus:ring-foreground hover:bg-accent/50 hover:text-accent-foreground"
      onClick={menutItemClick}
      aria-label={item.name}
      to="/$organizationIdentifier/members"
      params={{ organizationIdentifier: item.slug }}
      activeProps={{ className: 'bg-accent/50 text-accent-foreground ring-primary/50 text-primary focus:ring-primary' }}
    >
      <AvatarWrap className="m-2" type="organization" id={item.id} name={item.name} url={item.thumbnailUrl} />
      <div className="truncate p-2 pl-0 text-left">
        <div className="truncate leading-5">{item.name}</div>
        {item.userRole && (
          <div className="text-muted-foreground text-sm font-light opacity-0 transition-opacity duration-500 ease-in-out group-hover:opacity-100">
            {UserRole[item.userRole]}
          </div>
        )}
      </div>
    </Link>
  );
};

SheetMenuItem.displayName = 'SheetMenuItem';
