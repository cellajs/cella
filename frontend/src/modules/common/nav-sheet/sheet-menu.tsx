import { memo, useCallback, useMemo, useState } from 'react';
import type { UserMenu } from '~/types';

import { Checkbox } from '~/modules/ui/checkbox';
import { useNavigationStore } from '~/store/navigation';

import type { EntityType } from 'backend/types/common';
import { type LucideProps, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import CreateOrganizationForm from '../../organizations/create-organization-form';
import CreateWorkspaceForm from '../../workspaces/create-workspace-form';
import ContentPlaceholder from '../content-placeholder';
import { SheetMenuItem } from './sheet-menu-items';
import { SheetMenuSearch } from './sheet-menu-search';
import { type MenuItem, type MenuList, MenuSection } from './sheet-menu-section';

export type SectionItem = {
  storageType: 'organizations' | 'workspaces';
  label: string;
  createForm?: React.ReactNode;
  isSubmenu?: boolean;
  toPrefix?: boolean;
  icon?: React.ElementType<LucideProps>;
};

// Here you declare the menu sections
export const menuSections: SectionItem[] = [
  {
    storageType: 'organizations',
    label: 'common:organizations',
    isSubmenu: false,
    createForm: <CreateOrganizationForm dialog />,
  },
  {
    storageType: 'workspaces',
    isSubmenu: false,
    label: 'common:workspaces',
    createForm: <CreateWorkspaceForm dialog />,
  },
];

// Set search results to empty array for each menu type
export const initialSearchResults = menuSections
  .filter((el) => !el.isSubmenu)
  .reduce(
    (acc, section) => {
      acc[section.storageType] = [];
      return acc;
    },
    {} as Record<string, MenuList>,
  );

export type SearchResultsType = typeof initialSearchResults;

export const SheetMenu = memo(() => {
  const { t } = useTranslation();
  const { menu } = useNavigationStore();
  const { keepMenuOpen, hideSubmenu, toggleHideSubmenu, toggleKeepMenu } = useNavigationStore();

  const [searchTerm, setSearchTerm] = useState<string>('');
  const [searchResults, setSearchResults] = useState<SearchResultsType>(initialSearchResults);

  const searchResultsListItems = useCallback(() => {
    return Object.entries(searchResults).flatMap(([type, items]) => {
      return items.length > 0
        ? items.map((item: MenuItem) => (
            <SheetMenuItem key={item.id} searchResults item={item} type={type.slice(0, -1).toUpperCase() as EntityType} />
          ))
        : [];
    });
  }, [searchResults]);

  const renderedSections = useMemo(() => {
    return menuSections.map((section) => {
      const menuSection = menu[section.storageType as keyof UserMenu];
      return <MenuSection key={section.label} sectionType={section.storageType} data={menuSection} createForm={section.createForm} />;
    });
  }, [menu]);

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
        <div className="flex flex-col">
          <div className="max-xl:hidden my-4 flex items-center justify-center space-x-2">
            <Checkbox id="keepMenuOpen" checked={keepMenuOpen} onCheckedChange={toggleKeepMenu} aria-label={t('common:keep_menu_open')} />
            <label htmlFor="keepMenuOpen" className="cursor-pointer select-none text-sm font-medium leading-none">
              {t('common:keep_menu_open')}
            </label>
          </div>
          <div className="max-xl:hidden my-4 flex items-center justify-center space-x-2">
            <Checkbox id="hideSubmenuProjects" checked={hideSubmenu} onCheckedChange={toggleHideSubmenu} aria-label={t('common:hide_submenus')} />
            <label htmlFor="hideSubmenu" className="cursor-pointer select-none text-sm font-medium leading-none">
              {t('common:hide_submenus')}
            </label>
          </div>
        </div>
      )}
    </>
  );
});

SheetMenu.displayName = 'SheetMenu';
