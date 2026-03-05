import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import { monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { autoScrollForElements } from '@atlaskit/pragmatic-drag-and-drop-auto-scroll/element';
import { type Edge, extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { SearchIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { menuSectionsSchema } from '~/menu-config';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import { Spinner } from '~/modules/common/spinner';
import { useMemberUpdateMutation } from '~/modules/memberships/query-mutations';
import { FocusBridge, FocusTarget } from '~/modules/navigation/focus-bridge';
import { MenuSheetHeader } from '~/modules/navigation/menu-sheet/header';
import { filterMenuItems, getRelativeItemOrder, isPageData } from '~/modules/navigation/menu-sheet/helpers';
import { MenuSheetItem } from '~/modules/navigation/menu-sheet/item';
import { MenuSheetSection } from '~/modules/navigation/menu-sheet/section';
import { useUserStore } from '~/store/user';
import { useMenu } from './helpers/use-menu';

export const MenuSheet = () => {
  const { t } = useTranslation();
  const { user } = useUserStore();

  const { mutateAsync } = useMemberUpdateMutation();

  const [searchTerm, setSearchTerm] = useState<string>('');
  const [isSearchActive, setSearchActive] = useState<boolean>(false);

  const { menu, isLoading } = useMenu(user?.id);

  const searchResults = useMemo(() => filterMenuItems(menu, searchTerm), [menu, searchTerm]);

  // monitoring drop event
  useEffect(() => {
    const cleanups = [
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
          const newOrder = getRelativeItemOrder(
            menu,
            sourceItem.entityType,
            sourceItem.membership.archived,
            sourceItem.id,
            targetData.order,
            edge,
          );

          // Exit early if displayOrder remains the same
          if (newOrder === sourceItem.membership.displayOrder) return;

          await mutateAsync({
            path: {
              id: sourceItem.membership.id,
              tenantId: sourceItem.tenantId,
              orgId: sourceItem.membership.organizationId || sourceItem.id,
            },
            body: { displayOrder: newOrder },
            entityId: sourceItem.id,
            entityType: sourceItem.entityType,
          });
        },
      }),
    ];

    // Auto-scroll for the nav sheet's scroll area viewport (the actual scrollable element)
    const sheetEl = document.getElementById('nav-sheet');
    // TODO this wont work anymore with radix gone, is this still used code?
    // Can we replace it with the native scroll in sheet from baseUI if it has auto-scroll support for dragging near edges?
    // Or can we embed autoScrollForElements into sheet and drawer and dialog directly?
    const viewportEl = sheetEl?.querySelector<HTMLElement>('[data-radix-scroll-area-viewport]');
    if (viewportEl) {
      cleanups.push(
        autoScrollForElements({
          element: viewportEl,
          getAllowedAxis: () => 'vertical',
        }),
      );
    }

    console.debug('Initializing drag-and-drop monitoring for menu sheet');

    return combine(...cleanups);
  }, [menu]);

  // Show skeleton when loading or no user data yet
  if (isLoading || !user) return <Spinner />;

  const searchResultsListItems = () => {
    return searchResults.length > 0
      ? searchResults.map((item) => <MenuSheetItem key={item.id} searchResults item={item} />)
      : [];
  };

  const renderedSections = appConfig.menuStructure
    .map(({ entityType }) => {
      const menuData = menu[entityType];
      const menuSection = menuSectionsSchema[entityType];
      if (!menuSection) return null;

      return <MenuSheetSection key={entityType} options={menuSection} data={menuData} />;
    })
    .filter((el) => el !== null);

  return (
    <div data-search={!!searchTerm} className="group/menu bg-card w-full py-3 px-3 gap-1 min-h-screen flex flex-col">
      <FocusTarget target="sheet" />

      <MenuSheetHeader
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        isSearchActive={isSearchActive}
        setSearchActive={setSearchActive}
      />
      <div className="mt-3 flex flex-col gap-1 group-data-[search=false]/menu:hidden">
        {searchResultsListItems().length > 0 ? (
          searchResultsListItems()
        ) : (
          <ContentPlaceholder
            icon={SearchIcon}
            title="common:no_resource_found"
            titleProps={{ resource: t('common:results').toLowerCase() }}
          />
        )}
      </div>
      {!searchTerm && <>{renderedSections}</>}
      {/* Keyboard-only skip links at end of sheet */}
      <div className="mt-auto flex flex-col">
        <FocusBridge direction="to-content" className="focus:relative" />
        <FocusBridge direction="to-sidebar" className="focus:relative" />
      </div>
    </div>
  );
};
