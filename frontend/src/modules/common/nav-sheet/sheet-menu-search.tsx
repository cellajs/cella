import { Search, XCircle } from 'lucide-react';
import { useCallback, useEffect } from 'react';

import { useTranslation } from 'react-i18next';
import { Input } from '~/modules/ui/input';
import type { Page, UserMenu } from '~/types';
import { type SearchResultsType, initialSearchResults, menuSections } from './sheet-menu';

interface SheetMenuSearchProps {
  menu: UserMenu;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  onSearchResultsChange: (results: SearchResultsType) => void;
}

export const SheetMenuSearch = ({ menu, searchTerm, setSearchTerm, onSearchResultsChange }: SheetMenuSearchProps) => {
  const { t } = useTranslation();

  const filterResults = useCallback(
    (term: string) => {
      const lowerCaseTerm = term.toLowerCase();

      // Filter each menu section
      return menuSections.reduce(
        (acc, section) => {
          acc[section.id] = menu[section.id as keyof UserMenu].active.filter((page) => page.name.toLowerCase().includes(lowerCaseTerm));
          return acc;
        },
        {} as Record<string, Page[]>,
      );
    },
    [menu],
  );

  useEffect(() => {
    const results = searchTerm.trim() ? filterResults(searchTerm) : initialSearchResults;
    onSearchResultsChange(results);
  }, [searchTerm, filterResults, onSearchResultsChange]);

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  return (
    <div className="relative">
      <Search size={16} className="absolute left-3 -z-10 top-1/2 -translate-y-1/2" />
      <Input
        type="text"
        placeholder={t('common:search')}
        value={searchTerm}
        onChange={handleSearchChange}
        className="bg-transparent border-0 px-10"
      />
      {searchTerm && <XCircle size={16} className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer" onClick={() => setSearchTerm('')} />}
    </div>
  );
};
