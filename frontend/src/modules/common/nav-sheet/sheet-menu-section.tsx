import type React from 'react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
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
  const { activeSections } = useNavigationStore();

  const [optionsView, setOptionsView] = useState(false);
  const [isArchivedVisible, setArchivedVisible] = useState(false);

  const isSectionVisible = activeSections?.[sectionType] !== undefined ? activeSections[sectionType] : true;

  const sectionRef = useRef<HTMLDivElement>(null);
  const archivedRef = useRef<HTMLDivElement>(null);

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

  // TODO - refactor this into a generic hook?
  // Helper function to set or remove 'tabindex' attribute
  const updateTabIndex = (ref: React.RefObject<HTMLElement>, isVisible: boolean) => {
    if (!ref.current) return;

    const elements = ref.current.querySelectorAll<HTMLElement>('*');
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      if (isVisible) el.removeAttribute('tabindex');
      else el.setAttribute('tabindex', '-1');
    }
  };

  useEffect(() => {
    updateTabIndex(sectionRef, isSectionVisible);
  }, [sectionRef, isSectionVisible]);

  useEffect(() => {
    updateTabIndex(archivedRef, isArchivedVisible);
  }, [archivedRef, isArchivedVisible]);

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
      <div
        ref={sectionRef}
        className="grid transition-[grid-template-rows] grid-rows-[0fr] group-data-[visible=true]/menuSection:grid-rows-[1fr] ease-in-out duration-300"
      >
        <ul className="overflow-hidden">
          {optionsView ? (
            <SheetMenuItemsOptions data={data} shownOption="unarchive" />
          ) : (
            <SheetMenuItems type={entityType} data={data} shownOption="unarchive" createDialog={createDialog} />
          )}
          {!!data.length && (
            <div
              className="group/archived"
              data-have-inactive={!!data.filter((i) => i.membership.archived).length}
              data-submenu={false}
              data-archived-visible={isArchivedVisible}
            >
              <MenuArchiveToggle archiveToggleClick={archiveToggleClick} inactiveCount={data.filter((i) => i.membership.archived).length} />
              <div
                ref={archivedRef}
                className="grid transition-[grid-template-rows] grid-rows-[0fr] group-data-[archived-visible=true]/archived:grid-rows-[1fr] ease-in-out duration-300"
              >
                <ul className="overflow-hidden">
                  {optionsView ? (
                    <SheetMenuItemsOptions data={data} shownOption="archived" />
                  ) : (
                    <SheetMenuItems type={entityType} data={data} createDialog={createDialog} shownOption="archived" />
                  )}
                </ul>
              </div>
            </div>
          )}
        </ul>
      </div>
    </div>
  );
};
