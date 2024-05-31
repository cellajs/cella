import type React from 'react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useNavigationStore } from '~/store/navigation';
import type { UserMenu } from '~/types';
import { dialog } from '../dialoger/state';
import { MenuArchiveToggle } from './menu-archive-toggle';
import { MenuSectionSticky } from './menu-section-sticky';
import { SheetMenuItemsOptions } from './sheet-menu-items-options';
import { SheetMenuItems } from './sheet-menu-items';

interface MenuSectionProps {
  data: UserMenu[keyof UserMenu];
  sectionType: 'workspaces' | 'organizations';
  createForm: ReactNode;
  isSubmenu?: boolean;
}

export type MenuList = UserMenu[keyof UserMenu]['items'];
export type MenuItem = MenuList[0];

export const MenuSection = ({ data, sectionType, createForm, isSubmenu }: MenuSectionProps) => {
  const { t } = useTranslation();
  const [optionsView, setOptionsView] = useState(false);
  const [isArchivedVisible, setArchivedVisible] = useState(false);
  const [globalDragging, setGlobalDragging] = useState(false);
  const { activeSections } = useNavigationStore();
  const isSectionVisible = activeSections[sectionType];

  const sectionRef = useRef<HTMLDivElement>(null);
  const archivedRef = useRef<HTMLDivElement>(null);

  const createDialog = () => {
    dialog(createForm, {
      className: 'md:max-w-xl',
      id: `create-${data.type.toLowerCase()}`,
      title: t('common:create_resource', { resource: t(`common:${data.type.toLowerCase()}`).toLowerCase() }),
    });
  };

  const toggleOptionsView = () => {
    if (!optionsView) toast(t('common:configure_menu.text'));
    setOptionsView(!optionsView);
  };

  const archiveToggleClick = () => {
    setArchivedVisible(!isArchivedVisible);
  };

  // Helper function to set or remove 'tabindex' attribute
  const updateTabIndex = (ref: React.RefObject<HTMLElement>, isVisible: boolean) => {
    if (!ref.current) return;

    const elements = ref.current.querySelectorAll<HTMLElement>('*');
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      if (isVisible) {
        el.removeAttribute('tabindex');
      } else {
        el.setAttribute('tabindex', '-1');
      }
    }
  };

  useEffect(() => {
    updateTabIndex(sectionRef, isSectionVisible);
  }, [sectionRef, isSectionVisible]);

  useEffect(() => {
    updateTabIndex(archivedRef, isArchivedVisible);
  }, [archivedRef, isArchivedVisible]);

  return (
    <>
      {!isSubmenu && (
        <MenuSectionSticky
          data={data}
          sectionType={sectionType}
          isSectionVisible={isSectionVisible}
          globalDragging={globalDragging}
          toggleOptionsView={toggleOptionsView}
          createDialog={createDialog}
        />
      )}
      <div
        ref={sectionRef}
        className={`grid transition-[grid-template-rows] ${isSectionVisible ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'} ease-in-out duration-300`}
      >
        <ul className="overflow-hidden">
          {optionsView ? (
            <SheetMenuItemsOptions
              isGlobalDragging={globalDragging}
              setGlobalDragging={setGlobalDragging}
              data={data}
              shownOption="unarchive"
              sectionType={sectionType}
            />
          ) : (
            <SheetMenuItems data={data} sectionType={sectionType} shownOption="unarchive" createDialog={createDialog} />
          )}
          {!!data.items.length && (
            <>
              <MenuArchiveToggle
                isSubmenu={isSubmenu}
                archiveToggleClick={archiveToggleClick}
                inactiveCount={data.items.filter((i) => i.archived).length}
                isArchivedVisible={isArchivedVisible}
              />
              <div
                ref={archivedRef}
                className={`grid transition-[grid-template-rows] ${
                  isArchivedVisible ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                } ease-in-out duration-300`}
              >
                <ul className="overflow-hidden">
                  {optionsView ? (
                    <SheetMenuItemsOptions
                      isGlobalDragging={globalDragging}
                      setGlobalDragging={setGlobalDragging}
                      data={data}
                      shownOption="archived"
                      sectionType={sectionType}
                    />
                  ) : (
                    <SheetMenuItems data={data} sectionType={sectionType} createDialog={createDialog} shownOption="archived" />
                  )}
                </ul>
              </div>
            </>
          )}
        </ul>
      </div>
    </>
  );
};
