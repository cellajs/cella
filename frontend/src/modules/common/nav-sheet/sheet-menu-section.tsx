import { ChevronDown, Plus, Settings2 } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Sticky from 'react-sticky-el';
import { toast } from 'sonner';
import { Button } from '~/modules/ui/button';
import { useNavigationStore } from '~/store/navigation';
import type { Page, UserMenu } from '~/types';
import { dialog } from '../dialoger/state';
import { MenuArchiveToggle } from './menu-archive-toggle';
import type { SectionItem } from './sheet-menu';
import { SheetMenuItem } from './sheet-menu-item';
import { SheetMenuItemOptions } from './sheet-menu-item-options';
import { TooltipButton } from '../tooltip-button';
import { makeTransition } from '~/lib/utils';

interface MenuSectionProps {
  key: string;
  section: SectionItem;
  data: UserMenu[keyof UserMenu];
  menuItemClick: () => void;
}

type MenuList = UserMenu[keyof UserMenu]['items'];
type MenuItem = MenuList[0];
const sortById = (a: MenuItem, b: MenuItem, order: string[]) => {
  const indexA = order.indexOf(a.id);
  const indexB = order.indexOf(b.id);
  if (indexA === -1 || indexB === -1) return indexA === -1 ? 1 : -1;
  return indexA - indexB;
};

export const MenuSection: React.FC<MenuSectionProps> = ({ section, data, menuItemClick }) => {
  const { t } = useTranslation();
  const [optionsView, setOptionsView] = useState(false);
  const [isArchivedVisible, setArchivedVisible] = useState(false);
  const { activeSections, toggleSection, activeItemsOrder, setActiveItemsOrder } = useNavigationStore();
  const isSectionVisible = activeSections[section.id];

  const sectionRef = useRef<HTMLDivElement>(null);
  const archivedRef = useRef<HTMLDivElement>(null);

  const [unarchive, setUnarchive] = useState<MenuList>(
    data.items.filter((item) => !item.archived).sort((a, b) => sortById(a, b, activeItemsOrder[section.id as keyof UserMenu])),
  );

  const archived = data.items.filter((item) => item.archived);

  const createDialog = () => {
    dialog(section.createForm, {
      className: 'md:max-w-xl',
      id: `create-${section.type.toLowerCase()}`,
      title: section.id === 'workspaces' ? t('common:create_workspace') : t('common:create_organization'),
    });
  };

  const toggleOptionsView = (value: boolean) => {
    if (value) toast(t('common:configure_menu.text'));
    setOptionsView(value);
  };

  const archiveToggleClick = () => {
    if (archived.length > 0) setArchivedVisible(!isArchivedVisible);
  };

  // Render the menu items for each section
  const renderItems = (list: MenuList, canCreate: boolean, archived: boolean) => {
    if (!canCreate) {
      return (
        <li className="py-2 text-muted-foreground text-sm text-light text-center">
          {t('common:no_section_yet', { section: t(section.type.toLowerCase()).toLowerCase() })}
        </li>
      );
    }

    if (!archived && list.length < 1 && canCreate && section.createForm) {
      return (
        <div className="flex items-center">
          <Button className="w-full" variant="ghost" onClick={createDialog}>
            <Plus size={14} />
            <span className="ml-1 text-sm text-light">
              {t('common:create_your_first')} {t(section.type.toLowerCase()).toLowerCase()}
            </span>
          </Button>
        </div>
      );
    }
    return list.map((item: Page) => <SheetMenuItem key={item.id} item={item} menuItemClick={menuItemClick} />);
  };

  // Render the option items to configure the section
  const renderOptions = (list: MenuList) => {
    if (list.length === 0) {
      return (
        <li className="py-2 text-muted-foreground text-sm text-light text-center">
          {t('common:no_section_yet', { section: t(section.type.toLowerCase()).toLowerCase() })}
        </li>
      );
    }
    if (list[0].archived) return list.map((item: Page) => <SheetMenuItemOptions key={item.id} item={item} sectionName={section.id} />);
    return (
      <>
        {list.map((item: Page) => (
          <SheetMenuItemOptions key={item.id} item={item} sectionName={section.id} />
        ))}
      </>
    );
  };

  useEffect(() => {
    const sectionItems = activeItemsOrder[section.id];
    const unarchive = data.items
      .filter((item) => !item.archived)
      .map((item) => {
        if (!sectionItems.includes(item.id)) setActiveItemsOrder(section.id, [...sectionItems, item.id]);
        return item;
      });
    setUnarchive(unarchive.sort((a, b) => sortById(a, b, activeItemsOrder[section.id])));
  }, [data, activeItemsOrder]);

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
      <Sticky scrollElement="#nav-sheet-viewport" stickyClassName="z-10">
        <div className="flex items-center gap-2 z-10 py-2 bg-background justify-between px-1 -mx-1">
          <Button
            style={{
              viewTransitionName: `section-${section.id}`,
            }}
            onClick={() => makeTransition(() => toggleSection(section.id))}
            className="w-full justify-between transition-transform"
            variant="secondary"
          >
            <div className="flex items-center">
              <span
                style={{
                  viewTransitionName: `section-text-${section.id}`,
                }}
                className="flex items-center"
              >
                {section.icon && <section.icon className="mr-2 w-5 h-5" />}
                {t(section.label)}
              </span>
              {!isSectionVisible && <span className="inline-block px-2 py-1 text-xs font-light text-muted-foreground">{unarchive.length}</span>}
            </div>

            <ChevronDown size={16} className={`transition-transform opacity-50 ${isSectionVisible ? 'rotate-180' : 'rotate-0'}`} />
          </Button>
          {!!isSectionVisible && (
            <TooltipButton toolTipContent={t('common:options')} side="bottom" sideOffset={10}>
              <Button
                disabled={!archived.length && !unarchive.length}
                className={`w-12 px-3 duration-300 ${isSectionVisible ? 'animate-in fade-in slide-in-from-right' : ''}`}
                variant="secondary"
                size="icon"
                onClick={() => toggleOptionsView(!optionsView)}
              >
                <Settings2 size={16} />
              </Button>
            </TooltipButton>
          )}

          {isSectionVisible && data.canCreate && section.createForm && (
            <TooltipButton toolTipContent={t('common:create')} sideOffset={22} side="right" portal>
              <Button
                className={`w-12 px-3 duration-300 ${isSectionVisible ? 'animate-in fade-in slide-in-from-right' : ''}`}
                variant="secondary"
                size="icon"
                onClick={createDialog}
              >
                <Plus size={16} />
              </Button>
            </TooltipButton>
          )}
        </div>
      </Sticky>
      <div
        ref={sectionRef}
        className={`grid transition-[grid-template-rows] ${isSectionVisible ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'} ease-in-out duration-300`}
      >
        <ul className="overflow-hidden">
          {optionsView ? renderOptions(unarchive) : renderItems(unarchive, data.canCreate, false)}
          {!!(unarchive.length || archived.length) && (
            <>
              <MenuArchiveToggle archiveToggleClick={archiveToggleClick} inactiveCount={archived.length} isArchivedVisible={isArchivedVisible} />
              <div
                ref={archivedRef}
                className={`grid transition-[grid-template-rows] ${
                  isArchivedVisible ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                } ease-in-out duration-300`}
              >
                <ul className="overflow-hidden">{optionsView ? renderOptions(archived) : renderItems(archived, data.canCreate, true)}</ul>
              </div>
            </>
          )}
        </ul>
      </div>
    </>
  );
};
