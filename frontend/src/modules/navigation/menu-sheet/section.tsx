import type { ContextEntity } from 'config';
import { Info } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { AlertWrap } from '~/modules/common/alert-wrap';
import { sheet } from '~/modules/common/sheeter/state';
import type { UserMenu, UserMenuItem } from '~/modules/me/types';
import { MenuSheetItemsEdit } from '~/modules/navigation/menu-sheet/items-edit-list';
import { MenuSheetItems } from '~/modules/navigation/menu-sheet/items-list';
import { SectionArchiveButton } from '~/modules/navigation/menu-sheet/section-archive-button';
import { MenuSectionButton } from '~/modules/navigation/menu-sheet/section-button';
import { useNavigationStore } from '~/store/navigation';

interface MenuSheetSectionProps {
  data: UserMenuItem[];
  sectionType: keyof UserMenu;
  sectionLabel: string;
  entityType: ContextEntity;
  createAction?: () => void;
}

export const MenuSheetSection = ({ data, sectionType, sectionLabel, entityType, createAction }: MenuSheetSectionProps) => {
  const { t } = useTranslation();
  const isMobile = useBreakpoints('max', 'sm');
  const toggleSection = useNavigationStore((state) => state.toggleSection);
  const activeSections = useNavigationStore((state) => state.activeSections);

  const [isEditing, setIsEditing] = useState(false);

  const archivedSectionType = `${sectionType}-archived`;
  const isArchivedVisible = activeSections?.[archivedSectionType] ?? true;
  const isSectionVisible = activeSections?.[sectionType] ?? true;
  const archivedCount = data.filter((i) => i.membership.archived).length;

  const handleCreateAction = () => {
    if (isMobile) sheet.remove('nav-sheet');

    createAction?.();
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
            <AlertWrap id="menu_management" variant="plain" Icon={Info}>
              {t('common:configure_menu.text')}
            </AlertWrap>
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
              <MenuSheetItems type={entityType} data={data} shownOption="unarchive" createAction={createAction} />
            )}
            {!!data.length && (
              <div className="group/archived" data-has-archived={!!archivedCount} data-submenu={false} data-archived-visible={isArchivedVisible}>
                {(!!archivedCount || isEditing) && <SectionArchiveButton archiveToggleClick={archiveToggleClick} archivedCount={archivedCount} />}
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
                        <MenuSheetItems type={entityType} data={data} createAction={createAction} shownOption="archived" />
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
