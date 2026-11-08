import { useMatchRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { ChannelEntityType } from 'shared';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import { channelTabsInMenu } from '~/modules/common/page/tab-nav';
import type { UserMenuItem } from '~/modules/me/types';
import { MenuSheetChannelTabs } from '~/modules/navigation/menu-sheet/channel-tabs';
import { isSubmenuShown, sortAndFilterMenu, useSubmenuHiddenOpen } from '~/modules/navigation/menu-sheet/helpers/menu-rows';
import { menuUnseenChannelIds } from '~/modules/navigation/menu-sheet/helpers/use-menu-item-unseen-count';
import { MenuSheetHiddenGroup } from '~/modules/navigation/menu-sheet/hidden-group';
import { MenuSheetItem } from '~/modules/navigation/menu-sheet/item';
import type { MenuSectionOptions } from '~/modules/navigation/menu-sheet/section';
import { getChannelRoute } from '~/utils/channel-route';

/** A channel's page tabs under its menu row while its pages are open. */
function OpenChannelTabs({ channel }: { channel: UserMenuItem }) {
  const matchRoute = useMatchRoute();
  const { to, params } = getChannelRoute(channel);
  if (!matchRoute({ to, params, fuzzy: true })) return null;

  return <MenuSheetChannelTabs channel={channel} className="py-1 pl-12" />;
}

/** The hidden sub-rows of a row behind a toggle, for a row that has any. Their unseen count stays on the toggle. */
function HiddenSubmenu({ submenu, itemId, isResting }: { submenu: UserMenuItem[]; itemId: string; isResting: boolean }) {
  const [isOpen, setIsOpen] = useSubmenuHiddenOpen(itemId);
  const hiddenItems = submenu.filter((sub) => sub.membership.hidden);
  if (!hiddenItems.length) return null;

  return (
    <MenuSheetHiddenGroup
      isSubmenu
      isOpen={isOpen}
      onToggle={() => setIsOpen(!isOpen)}
      hiddenCount={hiddenItems.length}
      hiddenChannelIds={hiddenItems.flatMap((sub) => menuUnseenChannelIds(sub, false))}
    >
      <MenuSheetItemsList entityType={submenu[0].entityType} items={submenu} isHidden isSubmenu isResting={isResting} />
    </MenuSheetHiddenGroup>
  );
}

/** The placeholder a section shows while it has no items. */
export function MenuSheetNoItems({ entityType }: { entityType: ChannelEntityType }) {
  const { t } = useTranslation();

  return (
    <li>
      <ContentPlaceholder size="sm" title="c:no_resource_yet" titleOptions={{ resource: t(entityType, { count: 0 }) }} />
    </li>
  );
}

interface MenuSheetItemsListProps {
  items: UserMenuItem[];
  entityType: ChannelEntityType;
  isHidden: boolean;
  options?: MenuSectionOptions;
  /** It lists a row's submenu, so its rows render as sub-rows. */
  isSubmenu?: boolean;
  /** The page of another row of the parent's list is open, so its sub-rows rest grey. */
  isResting?: boolean;
}

export function MenuSheetItemsList({ items, entityType, isHidden, options, isSubmenu = false, isResting = false }: MenuSheetItemsListProps) {
  const matchRoute = useMatchRoute();
  if (items.length === 0) return <MenuSheetNoItems entityType={entityType} />;

  // Searched in all rows, hidden too, as the active and hidden lists render apart
  const openItem = isSubmenu
    ? undefined
    : items.find((item) => {
        const { to, params } = getChannelRoute(item);
        return matchRoute({ to, params, fuzzy: true, includeSearch: false });
      });

  return sortAndFilterMenu(items, isHidden).map((item) => {
    const hasSubmenu = isSubmenuShown(item);
    const isSubmenuResting = !!openItem && openItem.id !== item.id;
    return (
      <li key={item.id}>
        <MenuSheetItem item={item} isSubitem={isSubmenu} isResting={isResting} icon={options?.icon} />
        {channelTabsInMenu(item.entityType) && <OpenChannelTabs channel={item} />}
        {hasSubmenu && (
          <>
            <ul>
              <MenuSheetItemsList
                entityType={item.submenu[0].entityType}
                items={item.submenu}
                isHidden={false}
                isSubmenu
                isResting={isSubmenuResting}
              />
            </ul>
            <HiddenSubmenu submenu={item.submenu} itemId={item.id} isResting={isSubmenuResting} />
          </>
        )}
      </li>
    );
  });
}
