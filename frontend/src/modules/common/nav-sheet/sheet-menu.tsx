import { memo, useCallback, useMemo, useState } from 'react';
import type { Page, UserMenu } from '~/types';

import { Checkbox } from '~/modules/ui/checkbox';
import { useNavigationStore } from '~/store/navigation';

import type { PageResourceType } from 'backend/types/common';
import { type LucideProps, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import CreateOrganizationForm from '../../organizations/create-organization-form';
import CreateWorkspaceForm from '../../workspaces/create-workspace-form';
import ContentPlaceholder from '../content-placeholder';
import { SheetMenuItem } from './sheet-menu-item';
import { SheetMenuSearch } from './sheet-menu-search';
import { MenuSection } from './sheet-menu-section';

export type SectionItem = {
  id: 'organizations' | 'workspaces' | 'projects';
  type: PageResourceType;
  label: string;
  createForm?: React.ReactNode;
  icon?: React.ElementType<LucideProps>;
};

// Here you declare the menu sections
export const menuSections: SectionItem[] = [
  { id: 'organizations', type: 'ORGANIZATION', label: 'common:organizations', createForm: <CreateOrganizationForm dialog /> },
  { id: 'workspaces', type: 'WORKSPACE', label: 'common:workspaces', createForm: <CreateWorkspaceForm dialog /> },
  // { id: 'projects', type: 'PROJECT', label: 'common:projects' },
];

// Set search results to empty array for each menu type
export const initialSearchResults = menuSections.reduce(
  (acc, section) => {
    acc[section.id] = [];
    return acc;
  },
  {} as Record<string, Page[]>,
);

export type SearchResultsType = typeof initialSearchResults;

export const SheetMenu = memo(() => {
  const { t } = useTranslation();
  const { menu } = useNavigationStore();
  const isSmallScreen = useBreakpoints('max', 'lg');

  const { keepMenuOpen, toggleKeepMenu, setSheet } = useNavigationStore();

  const [searchTerm, setSearchTerm] = useState<string>('');
  const [searchResults, setSearchResults] = useState<SearchResultsType>(initialSearchResults);

  // Handle menu item click
  const menuItemClick = () => {
    if (isSmallScreen || !keepMenuOpen) setSheet(null);
  };

  // Render search results
  const searchResultsListItems = useCallback(() => {
    return Object.entries(searchResults).flatMap(([_, items]) => {
      return items.length > 0
        ? items.map((item: Page) => <SheetMenuItem key={item.id} item={item} menuItemClick={menuItemClick} searchResults={true} />)
        : [];
    });
  }, [searchResults, menuItemClick]);

  const renderedSections = useMemo(
    () =>
      menuSections.map((section) => {
        const menuSection = menu[section.id as keyof UserMenu];
        return <MenuSection key={section.id} section={section} data={menuSection} menuItemClick={menuItemClick} />;
      }),
    [menu, menuItemClick],
  );

  const handleSearchResultsChange = useCallback((results: SearchResultsType) => {
    setSearchResults(results);
  }, []);

  return (
    <>
      <SheetMenuSearch menu={menu} searchTerm={searchTerm} setSearchTerm={setSearchTerm} onSearchResultsChange={handleSearchResultsChange} />

      {searchTerm && (
        <div className="search-results mt-6">
          {searchResultsListItems().length > 0 ? (
            searchResultsListItems()
          ) : (
            <ContentPlaceholder Icon={Search} title={t('common:no_resource_found', { resource: t('common:results').toLowerCase() })} />
          )}
        </div>
      )}

      {!searchTerm && <div className="mt-2">{renderedSections}</div>}

      {!searchTerm && (
        <div className="max-xl:hidden my-4 flex items-center justify-center space-x-2">
          <Checkbox id="keepMenuOpen" checked={keepMenuOpen} onCheckedChange={toggleKeepMenu} aria-label={t('common:keep_menu_open')} />
          <label htmlFor="keepMenuOpen" className="cursor-pointer select-none text-sm font-medium leading-none">
            {t('common:keep_menu_open')}
          </label>
        </div>
      )}
    </>
  );
});

SheetMenu.displayName = 'SheetMenu';
