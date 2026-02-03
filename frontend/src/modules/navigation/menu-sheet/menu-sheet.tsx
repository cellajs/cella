import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import { monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { autoScrollForElements } from '@atlaskit/pragmatic-drag-and-drop-auto-scroll/element';
import { type Edge, extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { Link } from '@tanstack/react-router';
import { appConfig } from 'config';
import { ArrowLeftIcon, SearchIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { menuSectionsSchema } from '~/menu-config';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import type { UserMenuItem } from '~/modules/me/types';
import { useMemberUpdateMutation } from '~/modules/memberships/query-mutations';
import { AccountSheet } from '~/modules/navigation/account-sheet';
import { navSheetClassName } from '~/modules/navigation/app-nav';
import { MenuSheetHeader } from '~/modules/navigation/menu-sheet/header';
import { getRelativeItemOrder, isPageData } from '~/modules/navigation/menu-sheet/helpers';
import { MenuSheetItem } from '~/modules/navigation/menu-sheet/item';
import { MenuSheetSection } from '~/modules/navigation/menu-sheet/section';
import { Button, buttonVariants } from '~/modules/ui/button';
import { useNavigationStore } from '~/store/navigation';
import { useUserStore } from '~/store/user';
import { cn } from '~/utils/cn';
import { useMenu } from './helpers/use-menu';

export const MenuSheet = () => {
  const { t } = useTranslation();
  const { user } = useUserStore();

  const detailedMenu = useNavigationStore((state) => state.detailedMenu);
  const setNavSheetOpen = useNavigationStore((state) => state.setNavSheetOpen);

  const { mutateAsync } = useMemberUpdateMutation();

  const [searchTerm, setSearchTerm] = useState<string>('');
  const [searchResults, setSearchResults] = useState<UserMenuItem[]>([]);
  const [isSearchActive, setSearchActive] = useState<boolean>(false);

  const accountButtonRef = useRef(null);

  const { menu } = useMenu(user.id, { detailedMenu });

  // monitoring drop event
  useEffect(() => {
    const viewportEl = document.getElementById('nav-sheet-viewport');
    if (!viewportEl) return;

    return combine(
      autoScrollForElements({
        element: viewportEl,
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
          const newOrder = getRelativeItemOrder(
            menu,
            sourceItem.entityType,
            sourceItem.membership.archived,
            sourceItem.id,
            targetData.order,
            edge,
          );

          // Exit early if order remains the same
          if (newOrder === sourceItem.membership.order) return;

          await mutateAsync({
            id: sourceItem.membership.id,
            order: newOrder,
            orgIdOrSlug: sourceItem.membership.organizationId || sourceItem.id,
            // Mutation variables
            idOrSlug: sourceItem.id,
            entityType: sourceItem.entityType,
          });
        },
      }),
    );
  }, [menu]);

  const searchResultsListItems = () => {
    return searchResults.length > 0
      ? searchResults.map((item: UserMenuItem) => <MenuSheetItem key={item.id} searchResults item={item} />)
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
    <div
      data-search={!!searchTerm}
      className="group/menu w-full py-3 px-3 gap-1 min-h-[calc(100vh-0.5rem)] flex flex-col"
    >
      {/* Only visible when floating nav is present. To return to home */}
      <div id="return-nav" className="in-[.floating-nav]:flex hidden gap-2">
        <Link to="/home" className={cn(buttonVariants({ variant: 'ghost' }), 'w-full justify-start h-10')}>
          <ArrowLeftIcon size={16} strokeWidth={1.5} />
          <span className="ml-2 font-normal">Home</span>
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
              showCloseButton: false,
              modal: true,
              className: navSheetClassName,
              onClose: () => {
                setNavSheetOpen(null);
              },
            });
          }}
          className="w-10 px-1.5 h-10"
        >
          <AvatarWrap className="h-8 w-8" type="user" id={user.id} name={user.name} url={user.thumbnailUrl} />
        </Button>
      </div>

      <MenuSheetHeader
        menu={menu}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        searchResultsChange={setSearchResults}
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
    </div>
  );
};
