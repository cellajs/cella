import { memo, useCallback, useMemo, useState } from 'react';
import { Page, UserMenu } from '~/types';

import { Checkbox } from '~/components/ui/checkbox';
import { useNavigationStore } from '~/store/navigation';

import { useTranslation } from 'react-i18next';
import { useMediaQuery } from '~/hooks/useMediaQuery';
import CreateOrganizationForm from '../create-organization-form';
import { SheetMenuItem } from './sheet-menu-item';
import { SheetMenuSearch } from './sheet-menu-search';
import { MenuSection } from './sheet-menu-section';

export type SectionItem = {
  name: string;
  type: string;
  createForm?: React.ReactNode;
};

// Here you declare the menu sections
export const menuSections: SectionItem[] = [{ name: 'organizations', type: 'organization', createForm: <CreateOrganizationForm dialog /> }];

// Set search results to empty array for each menu type
export const initialSearchResults = menuSections.reduce(
  (acc, section) => {
    acc[section.name] = [];
    return acc;
  },
  {} as Record<string, Page[]>,
);

export type SearchResultsType = typeof initialSearchResults;

export const SheetMenu = memo(() => {
  const { t } = useTranslation();
  const { menu } = useNavigationStore();
  const isMobile = useMediaQuery('(max-width: 1024px)');

  const { keepMenuOpen, toggleKeepMenu, activeSections, toggleSection, setSheet } = useNavigationStore();

  const [searchTerm, setSearchTerm] = useState<string>('');
  const [searchResults, setSearchResults] = useState<SearchResultsType>(initialSearchResults);

  // Handle menu item click
  const handleItemClick = () => {
    if (isMobile || !keepMenuOpen) setSheet(null);
  };

  // Render search results
  const searchResultsListItems = useCallback(() => {
    return Object.entries(searchResults).flatMap(([_, items]) => {
      return items.length > 0 ? items.map((item: Page) => <SheetMenuItem key={item.id} item={item} handleClick={handleItemClick} />) : [];
    });
  }, [searchResults, handleItemClick]);

  const renderedSections = useMemo(
    () =>
      menuSections.map((section) => {
        const menuSection = menu[section.name as keyof UserMenu];

        return (
          <MenuSection
            key={section.name}
            section={section}
            data={menuSection}
            isSectionVisible={activeSections[section.name]}
            toggleSection={() => toggleSection(section.name)}
            handleItemClick={handleItemClick}
            itemCount={menuSection.active.length + menuSection.inactive.length}
          />
        );
      }),
    [menu, activeSections, toggleSection, handleItemClick],
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
            <div className="text-muted-foreground text-sm text-center">
              {t('label.no_results_found', {
                defaultValue: 'No results found',
              })}
            </div>
          )}
        </div>
      )}

      {!searchTerm && renderedSections}

      {!searchTerm && (
        <div className="my-4 flex items-center justify-center space-x-2">
          <Checkbox
            id="keepMenuOpen"
            checked={keepMenuOpen}
            onCheckedChange={toggleKeepMenu}
            aria-label="Keep menu open"
            className="duration-250 opacity-0 transition-opacity ease-in-out lg:translate-x-0 lg:opacity-100"
          />
          <label
            htmlFor="keepMenuOpen"
            className="duration-250 cursor-pointer select-none text-sm font-medium leading-none opacity-0 transition-opacity ease-in-out lg:translate-x-0 lg:opacity-100"
          >
            Keep menu open
          </label>
        </div>
      )}
    </>
  );
});

SheetMenu.displayName = 'SheetMenu';
