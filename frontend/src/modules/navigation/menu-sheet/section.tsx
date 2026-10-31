import { InfoIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { type RefObject, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChannelEntityType } from 'shared';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import type { TKey } from '~/lib/i18n-locales';
import { AlertBanner } from '~/modules/common/alerter/alert-banner';
import { collapseMotion } from '~/modules/common/collapse-motion';
import type { IconComponent } from '~/modules/common/icons/types';
import type { UserMenuItem } from '~/modules/me/types';
import { MenuSheetArchivedToggle } from '~/modules/navigation/menu-sheet/archived-toggle';
import { menuListMotion } from '~/modules/navigation/menu-sheet/helpers/menu-list-motion';
import { menuUnseenChannelIds } from '~/modules/navigation/menu-sheet/helpers/use-menu-item-unseen-count';
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
  /** The organization whose menu sheet holds the section, handed to its create action. */
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
  const activeChannelIds = items.filter((item) => !item.membership.archived).flatMap((item) => menuUnseenChannelIds(item, true));
  const archivedChannelIds = archivedItems.flatMap((item) => menuUnseenChannelIds(item, true));

  const handleCreate = options.createAction
    ? (ref: RefObject<HTMLButtonElement | null>) => {
        if (isMobile) closeNavSheet();
        options.createAction?.(ref, organizationId);
      }
    : undefined;

  const handleToggleEditing = () => setIsEditing(!isEditing);

  const handleToggleArchived = () => setSectionOpen(archivedSectionKey, !isArchivedVisible);

  const handleArchive = () => {
    if (isArchivedVisible) return false;
    setSectionOpen(archivedSectionKey, true);
    return true;
  };

  return (
    <div className="group/menu-section px-3" data-visible={isSectionVisible}>
      <MenuSheetSectionButton
        items={items}
        channelIds={activeChannelIds}
        options={options}
        isEditing={isEditing}
        isCollapsible={isCollapsible}
        isSectionVisible={isSectionVisible}
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
              <MenuSheetItemsListEdit items={items} isArchived={false} options={options} onArchive={handleArchive} />
            ) : (
              <MenuSheetItemsList entityType={options.entityType} items={items} isArchived={false} options={options} />
            )}
            {!!items.length && (
              <li className="group/archived" data-has-archived={!!archivedCount} data-submenu={false} data-archived-visible={isArchivedVisible}>
                {(!!archivedCount || isEditing) && (
                  // Moves with the rows when an archive or restore shifts them; only then, so other changes of place stay instant
                  <motion.div layout="position" layoutDependency={archivedCount}>
                    <MenuSheetArchivedToggle onToggle={handleToggleArchived} archivedCount={archivedCount} archivedChannelIds={archivedChannelIds} />
                  </motion.div>
                )}
                <AnimatePresence initial={false}>
                  {isArchivedVisible && (
                    <motion.ul key={archivedSectionKey} {...menuListMotion}>
                      {isEditing ? (
                        <MenuSheetItemsListEdit items={items} isArchived={true} options={options} />
                      ) : (
                        <MenuSheetItemsList entityType={options.entityType} items={items} options={options} isArchived={true} />
                      )}
                    </motion.ul>
                  )}
                </AnimatePresence>
              </li>
            )}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
