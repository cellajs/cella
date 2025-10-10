import { appConfig } from 'config';
import { SearchIcon, XCircleIcon } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import useFocusByRef from '~/hooks/use-focus-by-ref';
import useMounted from '~/hooks/use-mounted';
import type { UserMenu, UserMenuItem } from '~/modules/me/types';
import { InputGroup, InputGroupAddon, InputGroupInput } from '~/modules/ui/input-group';
import { cn } from '~/utils/cn';

interface MenuSheetSearchProps {
  menu: UserMenu;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  searchResultsChange: (results: UserMenuItem[]) => void;
  className?: string;
}

export const MenuSheetSearchInput = ({ menu, searchTerm, setSearchTerm, searchResultsChange, className }: MenuSheetSearchProps) => {
  const { t } = useTranslation();
  const { hasStarted } = useMounted();
  const isMobile = useBreakpoints('max', 'sm');

  const { setFocus, focusRef } = useFocusByRef();

  useEffect(() => {
    const filterResults = () => {
      if (!searchTerm.trim()) return [];

      const lowerCaseTerm = searchTerm.toLowerCase();

      // Flatten menu items and submenus
      const filterItems = (items: UserMenuItem[]): UserMenuItem[] =>
        items.flatMap((item) => {
          const isMatch = item.name.toLowerCase().includes(lowerCaseTerm);
          const filteredSubmenu = item.submenu ? filterItems(item.submenu) : [];
          return isMatch ? [item, ...filteredSubmenu] : filteredSubmenu;
        });

      return appConfig.menuStructure.flatMap(({ entityType }) => filterItems(menu[entityType]));
    };
    searchResultsChange(filterResults());
  }, [searchTerm, menu]);

  return (
    <InputGroup className={cn('z-20', className)}>
      <InputGroupInput
        id="nav-sheet-search"
        disabled={!hasStarted && isMobile} // Delay to prevent focus on initial render
        type="text"
        ref={focusRef}
        placeholder={t('common:placeholder.search')}
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="bg-transparent border-0 shadow-none focus-visible:ring-offset-0"
        aria-label={t('common:placeholder.search')}
      />
      <InputGroupAddon className="pl-1.5">
        <SearchIcon size={16} className="-z-10 opacity-50 group-data-[search=true]/menu:opacity-100" />
      </InputGroupAddon>

      <InputGroupAddon className="pr-2" align="inline-end">
        <XCircleIcon
          size={16}
          className="opacity-70 hover:opacity-100 cursor-pointer group-data-[search=false]/menu:hidden"
          onClick={() => {
            setSearchTerm('');
            setFocus();
          }}
        />
      </InputGroupAddon>
    </InputGroup>
  );
};
