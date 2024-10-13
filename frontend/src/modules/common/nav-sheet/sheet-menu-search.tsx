import { Search, XCircle } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import useMounted from '~/hooks/use-mounted';
import { Input } from '~/modules/ui/input';
import { menuSections } from '~/nav-config';
import type { UserMenu, UserMenuItem } from '~/types/common';

interface SheetMenuSearchProps {
  menu: UserMenu;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  searchResultsChange: (results: UserMenuItem[]) => void;
}

export const SheetMenuSearch = ({ menu, searchTerm, setSearchTerm, searchResultsChange }: SheetMenuSearchProps) => {
  const { t } = useTranslation();
  const { hasStarted } = useMounted();
  const isMobile = useBreakpoints('max', 'sm');

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

      return menuSections.flatMap((section) => filterItems(menu[section.name]));
    };
    searchResultsChange(filterResults());
  }, [searchTerm, menu]);

  return (
    <div className="relative">
      <Search size={16} className="absolute left-3 -z-10 top-1/2 -translate-y-1/2" style={{ opacity: searchTerm ? 1 : 0.5 }} />
      <Input
        disabled={!hasStarted && isMobile} // Delay to prevent focus on initial render
        type="text"
        placeholder={t('common:search')}
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="bg-transparent border-0 px-10"
      />
      {searchTerm && (
        <XCircle
          size={16}
          className="absolute right-3 top-1/2 opacity-70 hover:opacity-100 -translate-y-1/2 cursor-pointer"
          onClick={() => setSearchTerm('')}
        />
      )}
    </div>
  );
};
