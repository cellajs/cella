import { Search, XCircle } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import useMounted from '~/hooks/use-mounted';
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
  const { hasStarted } = useMounted();
  const isMobile = useBreakpoints('max', 'sm');

  useEffect(() => {
    const filterResults = () => {
      if (!searchTerm.trim()) return initialSearchResults;

      const lowerCaseTerm = searchTerm.toLowerCase();
      return menuSections.reduce(
        (acc, section) => {
          acc[section.id] = menu[section.id as keyof UserMenu].items.filter((page) => page.name.toLowerCase().includes(lowerCaseTerm));
          return acc;
        },
        {} as Record<string, Page[]>,
      );
    };

    onSearchResultsChange(filterResults());
  }, [searchTerm, menu, onSearchResultsChange]);

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
