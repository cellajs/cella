import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ContextEntity, DraggableItemData, UserMenu, UserMenuItem } from '~/types/common';

import { useNavigationStore } from '~/store/navigation';

import { autoScrollForElements } from '@atlaskit/pragmatic-drag-and-drop-auto-scroll/element';
import { type Edge, extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import { monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { config } from 'config';
import { Info, type LucideProps, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { dispatchCustomEvent } from '~/lib/custom-events';
import { menuSections } from '~/menu-config';
import { MainAlert } from '~/modules/common/alerter';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { updateMembership } from '~/modules/memberships/api';
import { getRelativeItemOrder } from '~/modules/navigation/menu-sheet/helpers';
import { updateMenuItem } from '~/modules/navigation/menu-sheet/helpers/menu-operations';
import { MenuSheetItem } from '~/modules/navigation/menu-sheet/item';
import { OfflineAccessSwitch } from '~/modules/navigation/menu-sheet/offline-access-switch';
import { MenuSheetSearchInput } from '~/modules/navigation/menu-sheet/search-input';
import { MenuSheetSection } from '~/modules/navigation/menu-sheet/section';
import { ScrollArea } from '~/modules/ui/scroll-area';
import { Switch } from '~/modules/ui/switch';

export type PageDraggableItemData = DraggableItemData<UserMenuItem> & { type: 'menuItem' };

export const isPageData = (data: Record<string | symbol, unknown>): data is PageDraggableItemData => {
  return data.dragItem === true && typeof data.order === 'number' && data.type === 'menuItem';
};

export type SectionItem = {
  name: keyof UserMenu;
  entityType: ContextEntity;
  label: string;
  createForm?: React.ReactNode;
  submenu?: SectionItem;
  icon?: React.ElementType<LucideProps>;
  description?: string;
};

export const MenuSheet = memo(() => {
  const { t } = useTranslation();

  const menu = useNavigationStore((state) => state.menu);
  const keepOpenPreference = useNavigationStore((state) => state.keepOpenPreference);
  const hideSubmenu = useNavigationStore((state) => state.hideSubmenu);
  const toggleHideSubmenu = useNavigationStore((state) => state.toggleHideSubmenu);
  const toggleKeepOpenPreference = useNavigationStore((state) => state.toggleKeepOpenPreference);

  const [searchTerm, setSearchTerm] = useState<string>('');
  const [searchResults, setSearchResults] = useState<UserMenuItem[]>([]);

  const scrollViewportRef = useRef(null);
  const pwaEnabled = config.has.pwa;

  const searchResultsListItems = useCallback(() => {
    return searchResults.length > 0 ? searchResults.map((item: UserMenuItem) => <MenuSheetItem key={item.id} searchResults item={item} />) : [];
  }, [searchResults]);

  const renderedSections = useMemo(() => {
    return menuSections.map((section) => {
      const menuSection = menu[section.name];

      return (
        <MenuSheetSection
          entityType={section.entityType}
          key={section.name}
          sectionLabel={section.label}
          sectionType={section.name}
          createForm={section.createForm}
          data={menuSection}
          description={section.description}
        />
      );
    });
  }, [menu]);

  // monitoring drop event
  useEffect(() => {
    if (!scrollViewportRef.current) return;
    return combine(
      autoScrollForElements({
        element: scrollViewportRef.current,
        getAllowedAxis: () => 'vertical',
      }),
      monitorForElements({
        canMonitor({ source }) {
          return isPageData(source.data) && !source.data.item.membership.archived;
        },
        async onDrop({ source, location }) {
          const target = location.current.dropTargets[0];
          if (!target) return;

          const sourceData = source.data;
          const targetData = target.data;
          if (!isPageData(targetData) || !isPageData(sourceData)) return;

          const { item: sourceItem } = sourceData;
          const edge: Edge | null = extractClosestEdge(targetData);
          const newOrder = getRelativeItemOrder(menu, sourceItem.entity, sourceItem.membership.archived, sourceItem.id, targetData.order, edge);

          const updatedMembership = await updateMembership({
            id: sourceItem.membership.id,
            order: newOrder,
            orgIdOrSlug: sourceItem.organizationId || sourceItem.id,
            idOrSlug: sourceItem.id,
            entityType: sourceItem.entity,
          });

          const updatedEntity: UserMenuItem = { ...sourceItem, membership: { ...sourceItem.membership, ...updatedMembership } };
          updateMenuItem(updatedEntity);

          // To be able to update, add a listener to manipulate data that has been changed in the menu (reordered entities on your page)
          dispatchCustomEvent('menuEntityChange', { entity: sourceItem.entity, membership: updatedMembership });
        },
      }),
    );
  }, [menu]);

  return (
    <ScrollArea className="h-full" id="nav-sheet" viewPortRef={scrollViewportRef}>
      <div data-search={!!searchTerm} className="group/menu p-3 min-h-[calc(100vh-0.5rem)] flex flex-col">
        <MenuSheetSearchInput menu={menu} searchTerm={searchTerm} setSearchTerm={setSearchTerm} searchResultsChange={setSearchResults} />

        <div className="search-results mt-3 group-data-[search=false]/menu:hidden">
          {searchResultsListItems().length > 0 ? (
            searchResultsListItems()
          ) : (
            <ContentPlaceholder Icon={Search} title={t('common:no_resource_found', { resource: t('common:results').toLowerCase() })} />
          )}
        </div>

        {!searchTerm && (
          <>
            {renderedSections}
            <div className="grow mt-4 border-b border-dashed" />
            <div className="flex flex-col mt-6 mb-1 mx-2 gap-4">
              <div className="max-xl:hidden flex items-center gap-4 ml-1">
                <Switch
                  size="xs"
                  id="keepMenuOpen"
                  checked={keepOpenPreference}
                  onCheckedChange={toggleKeepOpenPreference}
                  aria-label={t('common:keep_menu_open')}
                />
                <label htmlFor="keepMenuOpen" className="cursor-pointer select-none text-sm font-medium leading-none">
                  {t('common:keep_menu_open')}
                </label>
              </div>
              {pwaEnabled && <OfflineAccessSwitch />}
              {menuSections.some((el) => el.submenu) && (
                <div className="flex items-center gap-4 ml-1">
                  <Switch size="xs" id="hideSubmenu" checked={hideSubmenu} onCheckedChange={toggleHideSubmenu} ria-label={t('common:nested_menu')} />
                  <label htmlFor="hideSubmenu" className="cursor-pointer select-none text-sm font-medium leading-none">
                    {t('common:nested_menu')}
                  </label>
                </div>
              )}
              {pwaEnabled && (
                <MainAlert id="offline_access" variant="plain" Icon={Info}>
                  {t('common:offline_access.text')}
                </MainAlert>
              )}
            </div>
          </>
        )}
      </div>
    </ScrollArea>
  );
});
