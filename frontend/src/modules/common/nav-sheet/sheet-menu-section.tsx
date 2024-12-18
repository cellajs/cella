import { AnimatePresence, motion } from 'framer-motion';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { showToast } from '~/lib/toasts';
import { dialog } from '~/modules/common/dialoger/state';
import { MenuArchiveToggle } from '~/modules/common/nav-sheet/menu-archive-toggle';
import { MenuSectionSticky } from '~/modules/common/nav-sheet/menu-section-sticky';
import { SheetMenuItems } from '~/modules/common/nav-sheet/sheet-menu-items';
import { SheetMenuItemsOptions } from '~/modules/common/nav-sheet/sheet-menu-options';
import { useNavigationStore } from '~/store/navigation';
import type { ContextEntity, UserMenu, UserMenuItem } from '~/types/common';

interface MenuSectionProps {
  data: UserMenuItem[];
  sectionType: keyof UserMenu;
  sectionLabel: string;
  entityType: ContextEntity;
  createForm: ReactNode;
}

export const MenuSection = ({ data, sectionType, sectionLabel, entityType, createForm }: MenuSectionProps) => {
  const { t } = useTranslation();
  const activeSections = useNavigationStore((state) => state.activeSections);

  const [optionsView, setOptionsView] = useState(false);
  const [isArchivedVisible, setArchivedVisible] = useState(false);

  const isSectionVisible = activeSections?.[sectionType] !== undefined ? activeSections[sectionType] : true;

  const createDialog = () => {
    dialog(createForm, {
      className: 'md:max-w-2xl',
      id: `create-${entityType}`,
      title: t('common:create_resource', { resource: t(`common:${entityType}`).toLowerCase() }),
    });
  };

  const toggleOptionsView = () => {
    if (!optionsView) showToast(t('common:configure_menu.text'));
    setOptionsView(!optionsView);
  };

  const archiveToggleClick = () => {
    setArchivedVisible(!isArchivedVisible);
  };

  return (
    <div className="group/menuSection" data-visible={isSectionVisible}>
      <MenuSectionSticky
        data={data}
        sectionLabel={sectionLabel}
        sectionType={sectionType}
        optionsView={optionsView}
        isSectionVisible={isSectionVisible}
        toggleOptionsView={toggleOptionsView}
        createDialog={createDialog}
      />
      <AnimatePresence initial={false}>
        {isSectionVisible && (
          <motion.ul
            key={sectionType}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            {optionsView ? (
              <SheetMenuItemsOptions data={data} shownOption="unarchive" />
            ) : (
              <SheetMenuItems type={entityType} data={data} shownOption="unarchive" createDialog={createDialog} />
            )}
            {!!data.length && (
              <div
                className="group/archived"
                data-has-inactive={!!data.filter((i) => i.membership.archived).length}
                data-submenu={false}
                data-archived-visible={isArchivedVisible}
              >
                <MenuArchiveToggle archiveToggleClick={archiveToggleClick} inactiveCount={data.filter((i) => i.membership.archived).length} />
                <AnimatePresence initial={false}>
                  {isArchivedVisible && (
                    <motion.ul
                      key={`${sectionType}-archived`}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: 'easeInOut' }}
                      style={{ overflow: 'hidden' }}
                    >
                      {optionsView ? (
                        <SheetMenuItemsOptions data={data} shownOption="archived" />
                      ) : (
                        <SheetMenuItems type={entityType} data={data} createDialog={createDialog} shownOption="archived" />
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
