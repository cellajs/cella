import { Link } from '@tanstack/react-router';
import { AvatarWrap } from '~/components/avatar-wrap';
import { Page, UserRole } from '~/types';

interface SheetMenuItemProps {
  item: Page;
  menutItemClick: () => void;
}

export const SheetMenuItem = ({ item, menutItemClick }: SheetMenuItemProps) => {
  return (
    <Link
      className="group mb-2 flex h-14 w-full cursor-pointer items-start justify-start space-x-2 rounded p-0 transition duration-300 focus:outline-none ring-2 ring-transparent focus:ring-foreground hover:bg-accent/50 hover:text-accent-foreground"
      onClick={menutItemClick}
      aria-label={`Select ${item.name}`}
      to="/$organizationIdentifier"
      params={{ organizationIdentifier: item.slug }}
      activeProps={{ className: 'bg-accent/50 text-accent-foreground border border-primary/50 text-primary' }}
    >
      <div className="p-2">
        <AvatarWrap type="organization" id={item.id} name={item.name} url={item.thumbnailUrl} />
      </div>
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
