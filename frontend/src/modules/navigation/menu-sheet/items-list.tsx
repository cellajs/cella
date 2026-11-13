import { useMatchRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { ChannelEntityType } from 'shared';
import { getMenuSection } from '~/lib/entity-modules';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import { channelTabsInMenu } from '~/modules/common/page/tab-nav';
import type { UserMenuItem } from '~/modules/me/types';
import { MenuSheetChannelTabs } from '~/modules/navigation/menu-sheet/channel-tabs';
import { isSubmenuShown, type MenuGroup, menuGroup, sortAndFilterMenu, useSubmenuGroupOpen } from '~/modules/navigation/menu-sheet/helpers/menu-rows';
import { menuUnseenChannelIds } from '~/modules/navigation/menu-sheet/helpers/use-menu-item-unseen-count';
import { MenuSheetHiddenGroup } from '~/modules/navigation/menu-sheet/hidden-group';
import { MenuSheetItem } from '~/modules/navigation/menu-sheet/item';
import { getChannelRoute } from '~/utils/channel-route';

/** A channel's page tabs under its menu row while its pages are open. */
function OpenChannelTabs({ channel }: { channel: UserMenuItem }) {
  const matchRoute = useMatchRoute();
  const { to, params } = getChannelRoute(channel);
  if (!matchRoute({ to, params, fuzzy: true })) return null;

  return <MenuSheetChannelTabs channel={channel} className="py-1 pl-12" />;
}

interface SubmenuGroupProps {
  submenu: UserMenuItem[];
  itemId: string;
  group: Exclude<MenuGroup, 'active'>;
}

/** The hidden or the archived sub-rows of a row behind a toggle, for a row that has any. Their unseen count stays on the toggle. */
function SubmenuGroup({ submenu, itemId, group }: SubmenuGroupProps) {
  const [isOpen, setIsOpen] = useSubmenuGroupOpen(itemId, group);
  const groupItems = submenu.filter((sub) => menuGroup(sub) === group);
  if (!groupItems.length) return null;

  return (
    <MenuSheetHiddenGroup
      entityType={submenu[0].entityType}
      variant={group}
      isSubmenu
      isOpen={isOpen}
      onToggle={() => setIsOpen(!isOpen)}
      count={groupItems.length}
      channelIds={groupItems.flatMap((sub) => menuUnseenChannelIds(sub, false))}
    >
      <MenuSheetItemsList entityType={submenu[0].entityType} items={submenu} group={group} isSubmenu />
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
  group: MenuGroup;
  /** It lists a row's submenu, so its rows render as sub-rows. */
  isSubmenu?: boolean;
}

export function MenuSheetItemsList({ items, entityType, group, isSubmenu = false }: MenuSheetItemsListProps) {
  if (items.length === 0) return <MenuSheetNoItems entityType={entityType} />;

  return sortAndFilterMenu(items, group).map((item) => {
    const hasSubmenu = isSubmenuShown(item);
    return (
      <li key={item.id} className={isSubmenu ? 'group/row' : 'group/parent'} data-icon={!!getMenuSection(item.entityType)?.icon}>
        <MenuSheetItem item={item} isSubitem={isSubmenu} />
        {channelTabsInMenu(item.entityType) && <OpenChannelTabs channel={item} />}
        {hasSubmenu && (
          <>
            <ul>
              <MenuSheetItemsList entityType={item.submenu[0].entityType} items={item.submenu} group="active" isSubmenu />
            </ul>
            <SubmenuGroup submenu={item.submenu} itemId={item.id} group="hidden" />
            <SubmenuGroup submenu={item.submenu} itemId={item.id} group="archived" />
          </>
        )}
      </li>
    );
  });
}
