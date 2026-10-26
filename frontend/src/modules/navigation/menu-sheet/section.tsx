import { InfoIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { type RefObject, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig, type ChannelEntityType } from 'shared';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import type { TKey } from '~/lib/i18n-locales';
import { AlertBanner } from '~/modules/common/alerter/alert-banner';
import { collapseMotion } from '~/modules/common/collapse-motion';
import type { IconComponent } from '~/modules/common/icons/types';
import type { UserMenuItem } from '~/modules/me/types';
import { MenuSheetArchivedToggle } from '~/modules/navigation/menu-sheet/archived-toggle';
import { collectChannelIds } from '~/modules/navigation/menu-sheet/helpers/collect-channel-ids';
import { MenuSheetItemsList } from '~/modules/navigation/menu-sheet/items-list';
import { MenuSheetItemsListEdit } from '~/modules/navigation/menu-sheet/items-list-edit';
import { MenuSheetSectionButton } from '~/modules/navigation/menu-sheet/section-button';
import { closeNavSheet } from '~/modules/navigation/nav-sheet';
import { useNavigationStore } from '~/modules/navigation/navigation-store';

export type MenuSectionOptions = {
  label: TKey;
  entityType: ChannelEntityType;
  createAction?: (ref: RefObject<HTMLButtonElement | null>) => void;
  icon?: IconComponent;
};

interface MenuSheetSectionProps {
  items: UserMenuItem[];
  options: MenuSectionOptions;
  /** Opens in manage mode, as the organization switcher's Manage does. */
  initialEditing?: boolean;
  /** Called when manage mode is turned off. */
  onEditingEnd?: () => void;
}

export function MenuSheetSection({ items, options, initialEditing = false, onEditingEnd }: MenuSheetSectionProps) {
  const { t } = useTranslation();
  const isMobile = useBreakpointBelow('sm', false);
  const setSectionOpen = useNavigationStore((state) => state.setSectionOpen);

  const [isEditing, setIsEditing] = useState(initialEditing);

  // Own entries only: toggling one section re-renders that section alone
  const archivedSectionKey = `${options.entityType}-archived`;
  const isArchivedVisible = useNavigationStore((state) => state.activeSections?.[archivedSectionKey] ?? true);
  // Beside other sections the organization one starts collapsed: users seldom navigate there
  const isOpenByDefault = options.entityType !== 'organization' || appConfig.menuStructure.length === 1;
  const isSectionVisible = useNavigationStore((state) => state.activeSections?.[options.entityType] ?? isOpenByDefault);
  const archivedItems = items.filter((item) => item.membership.archived);
  const archivedCount = archivedItems.length;
  const activeChannelIds = collectChannelIds(items, { archived: false });
  const archivedChannelIds = collectChannelIds(items, { archived: true });

  const handleCreate = (ref: RefObject<HTMLButtonElement | null>) => {
    if (isMobile) closeNavSheet();
    options.createAction?.(ref);
  };

  const handleToggleEditing = () => {
    setIsEditing(!isEditing);
    if (isEditing) onEditingEnd?.();
  };

  const handleToggleArchived = () => setSectionOpen(archivedSectionKey, !isArchivedVisible);

  return (
    <div className="group/menu-section px-3" data-visible={isSectionVisible}>
      <MenuSheetSectionButton
        items={items}
        channelIds={activeChannelIds}
        options={options}
        isEditing={isEditing}
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
            <AlertBanner id="menu_management" variant="plain" icon={InfoIcon} animate>
              {t('c:configure_menu.text')}
            </AlertBanner>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence initial={false}>
        {isSectionVisible && (
          <motion.ul key={options.entityType} {...collapseMotion} className="overflow-hidden">
            {isEditing ? (
              <MenuSheetItemsListEdit items={items} isArchived={false} options={options} />
            ) : (
              <MenuSheetItemsList entityType={options.entityType} items={items} isArchived={false} options={options} />
            )}
            {!!items.length && (
              <li className="group/archived" data-has-archived={!!archivedCount} data-submenu={false} data-archived-visible={isArchivedVisible}>
                {(!!archivedCount || isEditing) && (
                  <MenuSheetArchivedToggle onToggle={handleToggleArchived} archivedCount={archivedCount} archivedChannelIds={archivedChannelIds} />
                )}
                <AnimatePresence initial={false}>
                  {isArchivedVisible && (
                    <motion.ul key={archivedSectionKey} {...collapseMotion} className="overflow-hidden">
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
