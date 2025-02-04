import type { ContextEntity } from 'config';
import { Info } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { MainAlert } from '~/modules/common/alerter';
import { dialog } from '~/modules/common/dialoger/state';
import { sheet } from '~/modules/common/sheeter/state';
import { MenuSheetItemsEdit } from '~/modules/navigation/menu-sheet/items-edit-list';
import { MenuSheetItems } from '~/modules/navigation/menu-sheet/items-list';
import { SectionArchiveButton } from '~/modules/navigation/menu-sheet/section-archive-button';
import { MenuSectionButton } from '~/modules/navigation/menu-sheet/section-button';
import { useNavigationStore } from '~/store/navigation';
import type { UserMenu, UserMenuItem } from '~/types/common';

interface MenuSheetSectionProps {
  data: UserMenuItem[];
  sectionType: keyof UserMenu;
  sectionLabel: string;
  entityType: ContextEntity;
  createForm: ReactNode;
  description?: string;
}

export const MenuSheetSection = ({ data, sectionType, sectionLabel, entityType, createForm, description }: MenuSheetSectionProps) => {
  const { t } = useTranslation();
  const isMobile = useBreakpoints('max', 'sm');
  const toggleSection = useNavigationStore((state) => state.toggleSection);
  const activeSections = useNavigationStore((state) => state.activeSections);

  const [isEditing, setIsEditing] = useState(false);

  const archivedSectionType = `${sectionType}-archived`;
  const isArchivedVisible = activeSections?.[archivedSectionType] ?? true;
  const isSectionVisible = activeSections?.[sectionType] ?? true;
  const inactiveCount = data.filter((i) => i.membership.archived).length;

  const createDialog = () => {
    if (isMobile) sheet.remove('nav-sheet');

    dialog(createForm, {
      className: 'md:max-w-2xl',
      id: `create-${entityType}`,
      title: t('common:create_resource', { resource: t(`common:${entityType}`).toLowerCase() }),
      description: description ? t(description) : '',
    });
  };

  const toggleIsEditing = () => {
    setIsEditing(!isEditing);
  };

  const archiveToggleClick = () => toggleSection(archivedSectionType);

  return (
    <div className="group/menuSection" data-visible={isSectionVisible}>
      <MenuSectionButton
        data={data}
        sectionLabel={sectionLabel}
        sectionType={sectionType}
        isEditing={isEditing}
        isSectionVisible={isSectionVisible}
        toggleIsEditing={toggleIsEditing}
        createDialog={createDialog}
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
            <MainAlert id="menu_management" variant="plain" Icon={Info}>
              {t('common:configure_menu.text')}
            </MainAlert>
          </motion.div>
        )}
      </AnimatePresence>
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
            {isEditing ? (
              <MenuSheetItemsEdit data={data} shownOption="unarchive" />
            ) : (
              <MenuSheetItems type={entityType} data={data} shownOption="unarchive" createDialog={createDialog} />
            )}
            {!!data.length && (
              <div className="group/archived" data-has-inactive={!!inactiveCount} data-submenu={false} data-archived-visible={isArchivedVisible}>
                {(!!inactiveCount || isEditing) && <SectionArchiveButton archiveToggleClick={archiveToggleClick} inactiveCount={inactiveCount} />}
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
                      {isEditing ? (
                        <MenuSheetItemsEdit data={data} shownOption="archived" />
                      ) : (
                        <MenuSheetItems type={entityType} data={data} createDialog={createDialog} shownOption="archived" />
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
