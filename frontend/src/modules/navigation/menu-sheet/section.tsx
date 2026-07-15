import { InfoIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { type RefObject, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChannelEntityType } from 'shared';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { AlertBanner } from '~/modules/common/alerter/alert-banner';
import type { IconComponent } from '~/modules/common/icons/types';
import { sheeter } from '~/modules/common/sheeter/use-sheeter';
import type { UserMenuItem } from '~/modules/me/types';
import { collectChannelIds } from '~/modules/navigation/menu-sheet/helpers/collect-channel-ids';
import { MenuSheetItemsEdit } from '~/modules/navigation/menu-sheet/items-edit-list';
import { MenuSheetItems } from '~/modules/navigation/menu-sheet/items-list';
import { SectionArchiveButton } from '~/modules/navigation/menu-sheet/section-archive-button';
import { MenuSectionButton } from '~/modules/navigation/menu-sheet/section-button';
import { navigationStore, useNavigationStore } from '~/modules/navigation/navigation-store';

export type MenuSectionOptions = {
  label: string;
  entityType: ChannelEntityType;
  createAction?: (ref: RefObject<HTMLButtonElement | null>) => void;
  icon?: IconComponent;
};

interface MenuSheetSectionProps {
  data: UserMenuItem[];
  options: MenuSectionOptions;
}

export const MenuSheetSection = ({ data, options }: MenuSheetSectionProps) => {
  const { t } = useTranslation();
  const isMobile = useBreakpointBelow('sm', false);
  const { toggleSection, setNavSheetOpen } = navigationStore.getState();
  const activeSections = useNavigationStore((state) => state.activeSections);

  const [isEditing, setIsEditing] = useState(false);

  const archivedSectionType = `${options.entityType}-archived`;
  const isArchivedVisible = activeSections?.[archivedSectionType] ?? true;
  const isSectionVisible = activeSections?.[options.entityType] ?? true;
  const archivedItems = data.filter((i) => i.membership?.archived);
  const archivedCount = archivedItems.length;
  const activeChannelIds = collectChannelIds(data, { archived: false });
  const archivedChannelIds = collectChannelIds(data, { archived: true });

  const handleCreateAction = (ref: RefObject<HTMLButtonElement | null>) => {
    if (isMobile) {
      sheeter.getState().remove('nav-sheet');
      setNavSheetOpen(null);
    }
    options.createAction?.(ref);
  };

  const toggleIsEditing = () => {
    setIsEditing(!isEditing);
  };

  const archiveToggleClick = () => toggleSection(archivedSectionType);

  return (
    <div className="group/menuSection px-3" data-visible={isSectionVisible}>
      <MenuSectionButton
        data={data}
        channelIds={activeChannelIds}
        options={options}
        isEditing={isEditing}
        isSectionVisible={isSectionVisible}
        toggleIsEditing={toggleIsEditing}
        handleCreateAction={handleCreateAction}
      />
      <AnimatePresence initial={false}>
        {isEditing && (
          <motion.div
            key="alert"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              height: { duration: 0.3 },
              opacity: { delay: 0.3, duration: 0.2 },
            }}
            style={{ overflow: 'hidden' }}
          >
            <AlertBanner id="menu_management" variant="plain" icon={InfoIcon} animate>
              {t('c:configure_menu.text')}
            </AlertBanner>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence initial={false}>
        {isSectionVisible && (
          <motion.ul
            key={options.entityType}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            {isEditing ? (
              <MenuSheetItemsEdit data={data} isArchived={false} options={options} />
            ) : (
              <MenuSheetItems type={options.entityType} data={data} isArchived={false} options={options} />
            )}
            {!!data.length && (
              <div
                className="group/archived"
                data-has-archived={!!archivedCount}
                data-submenu={false}
                data-archived-visible={isArchivedVisible}
              >
                {(!!archivedCount || isEditing) && (
                  <SectionArchiveButton
                    archiveToggleClick={archiveToggleClick}
                    archivedCount={archivedCount}
                    archivedChannelIds={archivedChannelIds}
                  />
                )}
                <AnimatePresence initial={false}>
                  {isArchivedVisible && (
                    <motion.ul
                      key={`${options.entityType}-archived`}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: 'easeInOut' }}
                      style={{ overflow: 'hidden' }}
                    >
                      {isEditing ? (
                        <MenuSheetItemsEdit data={data} isArchived={true} options={options} />
                      ) : (
                        <MenuSheetItems type={options.entityType} data={data} options={options} isArchived={true} />
                      )}
                    </motion.ul>
                  )}
                </AnimatePresence>
              </div>
            )}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
};
