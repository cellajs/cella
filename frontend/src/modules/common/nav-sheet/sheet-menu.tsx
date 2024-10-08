import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import type { ContextEntity, DraggableItemData, UserMenu, UserMenuItem } from '~/types/common';

import { useNavigationStore } from '~/store/navigation';

import { type Edge, extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import { monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { config } from 'config';
import { type LucideProps, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { updateMembership } from '~/api/memberships';
import { dispatchCustomEvent } from '~/lib/custom-events';

import ContentPlaceholder from '~/modules/common/content-placeholder';
import { findRelatedItemsByType } from '~/modules/common/nav-sheet/helpers';
import { SheetMenuItem } from '~/modules/common/nav-sheet/sheet-menu-items';
import { SheetMenuSearch } from '~/modules/common/nav-sheet/sheet-menu-search';
import { MenuSection } from '~/modules/common/nav-sheet/sheet-menu-section';
import { ScrollArea } from '~/modules/ui/scroll-area';
import { Switch } from '~/modules/ui/switch';
import { menuSections } from '~/nav-config';
import { NetworkModeSwitch } from './network-mode-switch';

export type PageDraggableItemData = DraggableItemData<UserMenuItem> & { type: 'menuItem' };

export const isPageData = (data: Record<string | symbol, unknown>): data is PageDraggableItemData => {
  return data.dragItem === true && typeof data.order === 'number' && data.type === 'menuItem';
};

export type SectionItem = {
  storageType: keyof UserMenu;
  type: ContextEntity;
  label: string;
  createForm?: React.ReactNode;
  isSubmenu?: boolean;
  toPrefix?: boolean;
  icon?: React.ElementType<LucideProps>;
};

export const SheetMenu = memo(() => {
  const { t } = useTranslation();
  const { menu, keepMenuOpen, hideSubmenu, toggleHideSubmenu, toggleKeepMenu } = useNavigationStore();
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [searchResults, setSearchResults] = useState<UserMenuItem[]>([]);

  const pwaEnabled = config.has.pwa;

  const searchResultsListItems = useCallback(() => {
    return searchResults.length > 0
      ? searchResults.map((item: UserMenuItem) => (
          <SheetMenuItem key={item.id} searchResults mainItemIdOrSlug={item.parentSlug} item={item} type={item.entity} />
        ))
      : [];
  }, [searchResults]);

  const renderedSections = useMemo(() => {
    return menuSections
      .filter((el) => !el.isSubmenu)
      .map((section) => {
        const menuSection = menu[section.storageType];

        return (
          <MenuSection
            entityType={section.type}
            key={section.type}
            sectionLabel={section.label}
            sectionType={section.storageType}
            createForm={section.createForm}
            data={menuSection}
          />
        );
      });
  }, [menu]);

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
          const neededItems = findRelatedItemsByType(menu, sourceData.item.entity, sourceData.item.membership.archived);
          const targetItemIndex = neededItems.findIndex((i) => i.id === targetData.item.id);
          const relativeItemIndex = closestEdgeOfTarget === 'top' ? targetItemIndex - 1 : targetItemIndex + 1;

          const relativeItem = neededItems[relativeItemIndex];
          let newOrder: number;

          if (relativeItem === undefined || relativeItem.membership.order === targetData.order) {
            newOrder = closestEdgeOfTarget === 'top' ? targetData.order / 2 : targetData.order + 1;
          } else if (relativeItem.id === sourceData.item.id) newOrder = sourceData.order;
          else newOrder = (relativeItem.membership.order + targetData.order) / 2;

          const updatedMembership = await updateMembership({
            membershipId: sourceData.item.membership.id,
            order: newOrder,
            organizationId: sourceData.item.organizationId || sourceData.item.id,
          });
          dispatchCustomEvent('menuEntityChange', { entity: sourceData.item.entity, membership: updatedMembership });
        },
      }),
    );
  }, [menu]);

  return (
    <ScrollArea className="h-full" id="nav-sheet">
      <div className="p-3 min-h-[calc(100vh-0.5rem)] flex flex-col">
        <SheetMenuSearch menu={menu} searchTerm={searchTerm} setSearchTerm={setSearchTerm} searchResultsChange={setSearchResults} />
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
            <div className="flex flex-col mt-6 mb-1 mx-2 gap-4">
              <div className="max-xl:hidden flex items-center gap-4 ml-1">
                <Switch size="xs" id="keepMenuOpen" checked={keepMenuOpen} onCheckedChange={toggleKeepMenu} aria-label={t('common:keep_menu_open')} />
                <label htmlFor="keepMenuOpen" className="cursor-pointer select-none text-sm font-medium leading-none">
                  {t('common:keep_menu_open')}
                </label>
              </div>
              {pwaEnabled && <NetworkModeSwitch />}
              {menuSections.some((el) => el.isSubmenu) && (
                <div className="flex items-center gap-4 ml-1">
                  <Switch size="xs" id="hideSubmenu" checked={hideSubmenu} onCheckedChange={toggleHideSubmenu} ria-label={t('common:nested_menu')} />
                  <label htmlFor="hideSubmenu" className="cursor-pointer select-none text-sm font-medium leading-none">
                    {t('common:nested_menu')}
                  </label>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </ScrollArea>
  );
});
