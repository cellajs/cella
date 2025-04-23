import { autoScrollForElements } from '@atlaskit/pragmatic-drag-and-drop-auto-scroll/element';
import { type Edge, extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import { monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { config } from 'config';
import { ArrowLeft, Info, Search } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { entityRelations } from '#/entity-config';

import { Link } from '@tanstack/react-router';
import { menuSectionsSchemas } from '~/menu-config';
import { AlertWrap } from '~/modules/common/alert-wrap';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import type { UserMenuItem } from '~/modules/me/types';
import { useMemberUpdateMutation } from '~/modules/memberships/query/mutations';
import { AccountSheet } from '~/modules/navigation/account-sheet';
import { getRelativeItemOrder, isPageData } from '~/modules/navigation/menu-sheet/helpers';
import { MenuSheetItem } from '~/modules/navigation/menu-sheet/item';
import { OfflineAccessSwitch } from '~/modules/navigation/menu-sheet/offline-access-switch';
import { MenuSheetSearchInput } from '~/modules/navigation/menu-sheet/search-input';
import { MenuSheetSection } from '~/modules/navigation/menu-sheet/section';
import { Button, buttonVariants } from '~/modules/ui/button';
import { ScrollArea } from '~/modules/ui/scroll-area';
import { Switch } from '~/modules/ui/switch';
import { useNavigationStore } from '~/store/navigation';
import { useUserStore } from '~/store/user';
import { cn } from '~/utils/cn';

const pwaEnabled = config.has.pwa;

export const MenuSheet = memo(() => {
  const { t } = useTranslation();
  const { user } = useUserStore();

  const menu = useNavigationStore((state) => state.menu);
  const keepOpenPreference = useNavigationStore((state) => state.keepOpenPreference);
  const hideSubmenu = useNavigationStore((state) => state.hideSubmenu);
  const setNavSheetOpen = useNavigationStore((state) => state.setNavSheetOpen);
  const toggleHideSubmenu = useNavigationStore((state) => state.toggleHideSubmenu);
  const toggleKeepOpenPreference = useNavigationStore((state) => state.toggleKeepOpenPreference);

  const [searchTerm, setSearchTerm] = useState<string>('');
  const [searchResults, setSearchResults] = useState<UserMenuItem[]>([]);

  const { mutateAsync } = useMemberUpdateMutation();

  const scrollViewportRef = useRef(null);
  const accountButtonRef = useRef(null);

  const searchResultsListItems = useCallback(() => {
    return searchResults.length > 0 ? searchResults.map((item: UserMenuItem) => <MenuSheetItem key={item.id} searchResults item={item} />) : [];
  }, [searchResults]);

  const renderedSections = useMemo(() => {
    return entityRelations
      .map(({ menuSectionName, entity: entityType }) => {
        const menuData = menu[menuSectionName];
        const menuSection = menuSectionsSchemas[entityType];
        if (!menuSection) return null;

        return (
          <MenuSheetSection
            entityType={entityType}
            key={menuSectionName}
            sectionLabel={menuSection.label}
            sectionType={menuSectionName}
            createAction={menuSection.createAction}
            data={menuData}
          />
        );
      })
      .filter((el) => el !== null);
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

          // Exit early if order remains the same
          if (targetData.order === sourceItem.membership.order || newOrder === sourceItem.membership.order) return;

          await mutateAsync({
            id: sourceItem.membership.id,
            order: newOrder,
            orgIdOrSlug: sourceItem.organizationId || sourceItem.id,
            // Mutation variables
            idOrSlug: sourceItem.id,
            entityType: sourceItem.entity,
          });
        },
      }),
    );
  }, [menu]);

  return (
    <ScrollArea className="h-full" id="nav-sheet" viewPortRef={scrollViewportRef}>
      <div data-search={!!searchTerm} className="group/menu py-3 max-sm:pt-0 min-h-[calc(100vh-0.5rem)] flex flex-col">
        {/* Only visible when floating nav is present. To return to home */}
        <div id="return-nav" className="[.floating-nav_&]:flex hidden gap-2 pt-3">
          <Link to="/home" className={cn(buttonVariants({ variant: 'ghost' }), 'w-full justify-start')}>
            <ArrowLeft size={16} strokeWidth={1.5} />
            <span className="ml-2 font-normal">Back to home</span>
          </Link>
          <Button
            ref={accountButtonRef}
            size="icon"
            variant="ghost"
            onClick={() => {
              setNavSheetOpen('account');
              // Create a sheet
              useSheeter.getState().create(<AccountSheet />, {
                id: 'nav-sheet',
                triggerRef: accountButtonRef,
                side: 'left',
                hideClose: true,
                modal: true,
                className:
                  'fixed sm:z-105 p-0 sm:inset-0 xs:max-w-80 sm:left-16 xl:group-[.keep-menu-open]/body:group-[.keep-menu-open]/body:shadow-none xl:group-[.keep-menu-open]/body:group-[.keep-menu-open]/body:border-r dark:shadow-[0_0_2px_5px_rgba(255,255,255,0.05)]',
                onClose: () => {
                  setNavSheetOpen(null);
                },
              });
            }}
            className="w-12 px-1.5"
          >
            <AvatarWrap className="h-8 w-8" type="user" id={user.id} name={user.name} url={user.thumbnailUrl} />
          </Button>
        </div>

        <MenuSheetSearchInput
          className="max-sm:hidden"
          menu={menu}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          searchResultsChange={setSearchResults}
        />
        <div className="mt-3 flex flex-col gap-1 group-data-[search=false]/menu:hidden">
          {searchResultsListItems().length > 0 ? (
            searchResultsListItems()
          ) : (
            <ContentPlaceholder icon={Search} title={t('common:no_resource_found', { resource: t('common:results').toLowerCase() })} />
          )}
        </div>
        {!searchTerm && (
          <>
            {renderedSections}
            <div className="grow mt-4 border-b border-dashed" />
            <div className="flex flex-col mt-6 mb-3 mx-2 gap-4">
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
              {entityRelations.some(({ subEntity }) => subEntity) && (
                <div className="flex items-center gap-4 ml-1">
                  <Switch size="xs" id="hideSubmenu" checked={hideSubmenu} onCheckedChange={toggleHideSubmenu} ria-label={t('common:nested_menu')} />
                  <label htmlFor="hideSubmenu" className="cursor-pointer select-none text-sm font-medium leading-none">
                    {t('common:nested_menu')}
                  </label>
                </div>
              )}
              {pwaEnabled && (
                <AlertWrap id="offline_access" variant="plain" icon={Info}>
                  {t('common:offline_access.text')}
                </AlertWrap>
              )}
            </div>
          </>
        )}
      </div>
    </ScrollArea>
  );
});
