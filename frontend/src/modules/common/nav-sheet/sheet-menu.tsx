import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import type { ContextEntity, UserMenu } from '~/types';

import { useParams } from '@tanstack/react-router';
import { useNavigationStore } from '~/store/navigation';

import { type Edge, extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import { monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { type LucideProps, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { updateMembership } from '~/api/memberships';
import { useMutateWorkSpaceQueryData } from '~/hooks/use-mutate-query-data';
import { isPageData } from '~/lib/drag-and-drop';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { findRelatedItemsByType } from '~/modules/common/nav-sheet/helpers';
import { SheetMenuItem } from '~/modules/common/nav-sheet/sheet-menu-items';
import { SheetMenuSearch } from '~/modules/common/nav-sheet/sheet-menu-search';
import { MenuSection } from '~/modules/common/nav-sheet/sheet-menu-section';
import CreateOrganizationForm from '~/modules/organizations/create-organization-form';
import { Switch } from '~/modules/ui/switch';
import CreateWorkspaceForm from '~/modules/workspaces/create-workspace-form';
import type { UserMenuItem } from '~/types';

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
  const { idOrSlug } = useParams({ strict: false });
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

  const callback = useMutateWorkSpaceQueryData(['workspaces', idOrSlug]);

  // monitoring drop event
  useEffect(() => {
    return combine(
      monitorForElements({
        canMonitor({ source }) {
          return isPageData(source.data);
        },
        async onDrop({ source, location }) {
          const target = location.current.dropTargets[0];
          if (!target) return;

          const sourceData = source.data;
          const targetData = target.data;
          if (!isPageData(targetData) || !isPageData(sourceData)) return;

          const closestEdgeOfTarget: Edge | null = extractClosestEdge(targetData);
          const neededItems = findRelatedItemsByType(menu, sourceData.item.entity);
          const targetItemIndex = neededItems.findIndex((i) => i.id === targetData.item.id);
          const relativeItemIndex = closestEdgeOfTarget === 'top' ? targetItemIndex - 1 : targetItemIndex + 1;

          const relativeItem = neededItems[relativeItemIndex];
          let newOrder: number;

          if (relativeItem === undefined || relativeItem.membership.order === targetData.order) {
            newOrder = closestEdgeOfTarget === 'top' ? targetData.order / 2 : targetData.order + 1;
          } else if (relativeItem.id === sourceData.item.id) newOrder = sourceData.order;
          else newOrder = (relativeItem.membership.order + targetData.order) / 2;

          const updatedItem = await updateMembership({ membershipId: sourceData.item.membership.id, order: newOrder });
          const slug = sourceData.item.parentSlug ? sourceData.item.parentSlug : sourceData.item.slug;
          if (idOrSlug === slug) callback([updatedItem], sourceData.item.parentSlug ? 'updateProjectMembership' : 'updateWorkspaceMembership');
        },
      }),
    );
  }, [menu]);

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
          <div className="grow mt-4 md:border-b md:border-dashed" />
          <div className="flex flex-col my-6 mx-2 gap-6">
            <div className="max-xl:hidden flex items-center gap-4 ml-1">
              <Switch size="xs" id="keepMenuOpen" checked={keepMenuOpen} onCheckedChange={toggleKeepMenu} aria-label={t('common:keep_menu_open')} />

              <label htmlFor="keepMenuOpen" className="cursor-pointer select-none text-sm font-medium leading-none">
                {t('common:keep_menu_open')}
              </label>
            </div>
            <div className="max-sm:hidden flex items-center gap-4 ml-1">
              <Switch size="xs" id="hideSubmenu" checked={hideSubmenu} onCheckedChange={toggleHideSubmenu} ria-label={t('common:hide_projects')} />
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
