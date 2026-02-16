import { InfoIcon, type LucideIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { type RefObject, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ContextEntityType } from 'shared';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { AlertWrap } from '~/modules/common/alert-wrap';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import type { UserMenuItem } from '~/modules/me/types';
import { MenuSheetItemsEdit } from '~/modules/navigation/menu-sheet/items-edit-list';
import { MenuSheetItems } from '~/modules/navigation/menu-sheet/items-list';
import { SectionArchiveButton } from '~/modules/navigation/menu-sheet/section-archive-button';
import { MenuSectionButton } from '~/modules/navigation/menu-sheet/section-button';
import { useNavigationStore } from '~/store/navigation';

export type MenuSectionOptions = {
  label: string;
  entityType: ContextEntityType;
  createAction?: (ref: RefObject<HTMLButtonElement | null>) => void;
  icon?: LucideIcon;
};

interface MenuSheetSectionProps {
  data: UserMenuItem[];
  options: MenuSectionOptions;
}

export const MenuSheetSection = ({ data, options }: MenuSheetSectionProps) => {
  const { t } = useTranslation();
  const isMobile = useBreakpoints('max', 'sm');
  const { toggleSection, setNavSheetOpen } = useNavigationStore.getState();
  const activeSections = useNavigationStore((state) => state.activeSections);

  const [isEditing, setIsEditing] = useState(false);

  const archivedSectionType = `${options.entityType}-archived`;
  const isArchivedVisible = activeSections?.[archivedSectionType] ?? true;
  const isSectionVisible = activeSections?.[options.entityType] ?? true;
  const archivedCount = data.filter((i) => i.membership?.archived).length;

  const handleCreateAction = (ref: RefObject<HTMLButtonElement | null>) => {
    if (isMobile) {
      useSheeter.getState().remove('nav-sheet');
      setNavSheetOpen(null);
    }
    options.createAction?.(ref);
  };

  const toggleIsEditing = () => {
    setIsEditing(!isEditing);
  };

  const archiveToggleClick = () => toggleSection(archivedSectionType);

  return (
    <div className="group/menuSection" data-visible={isSectionVisible}>
      <MenuSectionButton
        data={data}
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
            <AlertWrap id="menu_management" variant="plain" icon={InfoIcon}>
              {t('common:configure_menu.text')}
            </AlertWrap>
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
                  <SectionArchiveButton archiveToggleClick={archiveToggleClick} archivedCount={archivedCount} />
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
