import { InfoIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { type RefObject, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type ChannelEntityType, isChannelArchivable } from 'shared';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import type { TKey } from '~/lib/i18n-locales';
import { AlertBanner } from '~/modules/common/alerter/alert-banner';
import { collapseMotion } from '~/modules/common/collapse-motion';
import type { IconComponent } from '~/modules/common/icons/types';
import type { UserMenuItem } from '~/modules/me/types';
import { MenuSheetArchivedGroup } from '~/modules/navigation/menu-sheet/archived-group';
import { menuListMotion } from '~/modules/navigation/menu-sheet/helpers/menu-list-motion';
import { activeUnseenChannelIds, menuUnseenChannelIds } from '~/modules/navigation/menu-sheet/helpers/use-menu-item-unseen-count';
import { MenuSheetItemsList } from '~/modules/navigation/menu-sheet/items-list';
import { MenuSheetItemsListEdit } from '~/modules/navigation/menu-sheet/items-list-edit';
import { MenuSheetSectionButton } from '~/modules/navigation/menu-sheet/section-button';
import { closeNavSheet } from '~/modules/navigation/nav-sheet';
import { useNavigationStore } from '~/modules/navigation/navigation-store';

export type MenuSectionOptions = {
  label: TKey;
  entityType: ChannelEntityType;
  /** Opens the create flow; `organizationId` is set when it starts from one organization's menu sheet. */
  createAction?: (ref: RefObject<HTMLButtonElement | null>, organizationId?: string) => void;
  icon?: IconComponent;
};

interface MenuSheetSectionProps {
  items: UserMenuItem[];
  options: MenuSectionOptions;
  /** False for a lone section: collapsing it would hide the whole sheet. */
  isCollapsible: boolean;
  /** Handed to the create action. */
  organizationId?: string;
}

export function MenuSheetSection({ items, options, isCollapsible, organizationId }: MenuSheetSectionProps) {
  const { t } = useTranslation();
  const isMobile = useBreakpointBelow('sm', false);
  const setSectionOpen = useNavigationStore((state) => state.setSectionOpen);

  const [isEditing, setIsEditing] = useState(false);

  // Own entries only: toggling one section re-renders that section alone
  const archivedSectionKey = `${options.entityType}-archived`;
  const isArchivedVisible = useNavigationStore((state) => state.activeSections?.[archivedSectionKey] ?? true);
  // Beside other sections the organization one starts collapsed: users seldom navigate there
  const isOpenByDefault = options.entityType !== 'organization';
  const isSectionVisible = useNavigationStore((state) => !isCollapsible || (state.activeSections?.[options.entityType] ?? isOpenByDefault));
  const archivedItems = items.filter((item) => item.membership.archived);
  const archivedCount = archivedItems.length;
  const activeChannelIds = activeUnseenChannelIds(items);
  const archivedChannelIds = archivedItems.flatMap((item) => menuUnseenChannelIds(item, true));

  const handleCreate = options.createAction
    ? (ref: RefObject<HTMLButtonElement | null>) => {
        if (isMobile) closeNavSheet();
        options.createAction?.(ref, organizationId);
      }
    : undefined;

  const handleToggleEditing = () => setIsEditing(!isEditing);

  const handleToggleArchived = () => setSectionOpen(archivedSectionKey, !isArchivedVisible);

  const prepareArchive = () => {
    if (isArchivedVisible) return false;
    setSectionOpen(archivedSectionKey, true);
    return !!archivedCount;
  };

  const hasArchivedGroup = !!archivedCount || (!!items.length && isEditing && isChannelArchivable(options.entityType));

  return (
    <div className="group/menu-section px-3" data-visible={isSectionVisible}>
      <MenuSheetSectionButton
        {...{ items, options, isEditing, isCollapsible, isSectionVisible }}
        channelIds={activeChannelIds}
        onToggleEditing={handleToggleEditing}
        onCreate={handleCreate}
      />
      <AnimatePresence initial={false}>
        {isEditing && (
          <motion.div
            key="alert"
            {...collapseMotion}
            transition={{ height: { duration: 0.3 }, opacity: { delay: 0.3, duration: 0.2 } }}
            className="overflow-hidden"
          >
            <AlertBanner id="menu_management" variant="info" className="my-2" icon={InfoIcon} animate>
              {t('c:configure_menu.text')}
            </AlertBanner>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence initial={false}>
        {isSectionVisible && (
          <motion.ul key={options.entityType} {...menuListMotion}>
            {isEditing ? (
              <MenuSheetItemsListEdit items={items} isArchived={false} options={options} prepareArchive={prepareArchive} />
            ) : (
              <MenuSheetItemsList entityType={options.entityType} items={items} isArchived={false} options={options} />
            )}
            {hasArchivedGroup && (
              <li>
                <MenuSheetArchivedGroup
                  isOpen={isArchivedVisible}
                  onToggle={handleToggleArchived}
                  archivedCount={archivedCount}
                  archivedChannelIds={archivedChannelIds}
                  dropItems={isEditing ? items : undefined}
                >
                  {isEditing ? (
                    <MenuSheetItemsListEdit items={items} isArchived={true} options={options} />
                  ) : (
                    <MenuSheetItemsList entityType={options.entityType} items={items} options={options} isArchived={true} />
                  )}
                </MenuSheetArchivedGroup>
              </li>
            )}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
