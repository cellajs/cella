import { memo, useCallback, useMemo, useState } from 'react';
import type { ContextEntity, UserMenu } from '~/types';

import { Checkbox } from '~/modules/ui/checkbox';
import { useNavigationStore } from '~/store/navigation';

import { type LucideProps, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { UserMenuItem } from '~/types';
import CreateOrganizationForm from '../../organizations/create-organization-form';
import CreateWorkspaceForm from '../../workspaces/create-workspace-form';
import ContentPlaceholder from '../content-placeholder';
import { SheetMenuItem } from './sheet-menu-items';
import { SheetMenuSearch } from './sheet-menu-search';
import { MenuSection } from './sheet-menu-section';

export type SectionItem = {
  storageType: 'organizations' | 'workspaces';
  type: ContextEntity;
  createForm?: React.ReactNode;
  isSubmenu?: boolean;
  toPrefix?: boolean;
  icon?: React.ElementType<LucideProps>;
};

// Here you declare the menu sections
export const menuSections: SectionItem[] = [
  {
    storageType: 'organizations',
    isSubmenu: false,
    createForm: <CreateOrganizationForm dialog />,
    type: 'organization',
  },
  {
    storageType: 'workspaces',
    isSubmenu: false,
    createForm: <CreateWorkspaceForm dialog />,
    type: 'workspace',
  },
  {
    storageType: 'workspaces',
    isSubmenu: true,
    type: 'project',
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
    {} as Record<string, UserMenuItem[]>,
  );

export type SearchResultsType = typeof initialSearchResults;

export const SheetMenu = memo(() => {
  const { t } = useTranslation();
  const { menu } = useNavigationStore();
  const { keepMenuOpen, hideSubmenu, toggleHideSubmenu, toggleKeepMenu } = useNavigationStore();

  const [searchTerm, setSearchTerm] = useState<string>('');
  const [searchResults, setSearchResults] = useState<SearchResultsType>(initialSearchResults);

  const searchResultsListItems = useCallback(() => {
    return Object.entries(searchResults).flatMap(([_, items]) => {
      return items.length > 0 ? items.map((item: UserMenuItem) => <SheetMenuItem key={item.id} searchResults item={item} type={item.entity} />) : [];
    });
  }, [searchResults]);

  const renderedSections = useMemo(() => {
    return menuSections
      .filter((el) => !el.isSubmenu)
      .map((section) => {
        const menuSection = menu[section.storageType as keyof UserMenu];

        return (
          <MenuSection
            entityType={section.type}
            key={section.type}
            sectionType={section.storageType}
            createForm={section.createForm}
            data={menuSection}
          />
        );
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

      {!searchTerm && (
        <>
          <div className="mt-2">{renderedSections}</div>
          <div className="grow mt-4 border-b border-dashed" />
          <div className="flex flex-col my-6 mx-2 gap-6">
            <div className="max-xl:hidden flex items-center gap-2">
              <Checkbox
                id="keepMenuOpen"
                checked={keepMenuOpen}
                onCheckedChange={toggleKeepMenu}
                aria-label={t('common:keep_menu_open')}
                className="w-4 h-4"
              />
              <label htmlFor="keepMenuOpen" className="cursor-pointer select-none text-sm font-medium leading-none">
                {t('common:keep_menu_open')}
              </label>
            </div>
            <div className="max-sm:hidden flex items-center gap-2">
              <Checkbox
                id="hideSubmenu"
                checked={hideSubmenu}
                onCheckedChange={toggleHideSubmenu}
                aria-label={t('common:hide_projects')}
                className="w-4 h-4"
              />
              <label htmlFor="hideSubmenu" className="cursor-pointer select-none text-sm font-medium leading-none">
                {t('common:hide_projects')}
              </label>
            </div>
          </div>
        </>
      )}
    </>
  );
});

SheetMenu.displayName = 'SheetMenu';
