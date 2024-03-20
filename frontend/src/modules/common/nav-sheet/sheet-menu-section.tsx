import { ChevronDown, Plus, Settings2 } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Sticky from 'react-sticky-el';
import { Button } from '~/modules/ui/button';
import { Tooltip, TooltipContent, TooltipPortal, TooltipTrigger } from '~/modules/ui/tooltip';
import { useNavigationStore } from '~/store/navigation';
import type { Page, UserMenu } from '~/types';
import { dialog } from '../dialoger/state';
import { MenuArchiveToggle } from './menu-archive-toggle';
import type { SectionItem } from './sheet-menu';
import { SheetMenuItem } from './sheet-menu-item';
import { SheetMenuItemOptions } from './sheet-menu-item-options';

interface MenuSectionProps {
  key: string;
  section: SectionItem;
  data: UserMenu[keyof UserMenu];
  menutItemClick: () => void;
}

export const MenuSection: React.FC<MenuSectionProps> = ({ section, data, menutItemClick }) => {
  const { t } = useTranslation();
  const [optionsView, setOptionsView] = useState(false);
  const { activeSections, toggleSection } = useNavigationStore();
  const isSectionVisible = activeSections[section.id];

  const createDialog = () => {
    dialog(section.createForm, {
      className: 'md:max-w-xl',
      title: t('common:create_organization'),
    });
  };

  // TODO implement archiveToggleClick
  const archiveToggleClick = () => {
    console.log('archiveToggleClick');
  };

  // Render the menu items for each section
  const renderSectionItems = (sectionData: UserMenu[keyof UserMenu]) => {
    if (sectionData.active.length === 0 && !sectionData.canCreate) {
      return <li className="py-2 text-muted-foreground text-sm text-light text-center">{t('common:no_section_yet', { section: section.type })}</li>;
    }

    if (sectionData.active.length === 0 && sectionData.canCreate && section.createForm) {
      return (
        <div className="flex items-center">
          <Button className="w-full" variant="ghost" onClick={createDialog}>
            <Plus size={14} />
            <span className="ml-1 text-sm text-light">
              {t('common:create_your_first')} {section.type}
            </span>
          </Button>
        </div>
      );
    }

    return sectionData.active.map((item: Page) => <SheetMenuItem key={item.id} item={item} menutItemClick={menutItemClick} />);
  };

  // Render the option items to configure the section
  const renderSectionOptions = (sectionData: UserMenu[keyof UserMenu]) => {
    if (sectionData.active.length === 0) {
      return <li className="py-2 text-muted-foreground text-sm text-light text-center">{t('common:no_section_yet', { section: section.type })}</li>;
    }

    return sectionData.active.map((item: Page) => <SheetMenuItemOptions key={item.id} item={item} />);
  };

  return (
    <div className="mt-2">
      <Sticky scrollElement="#nav-sheet-viewport" stickyClassName="z-10">
        <div className="flex items-center gap-2 z-10 py-2 bg-background justify-between px-1 -mx-1">
          <Button onClick={() => toggleSection(section.id)} className="w-full justify-between transition-transform" variant="secondary">
            <div>
              <span>{t(section.id)}</span>
              {!isSectionVisible && (
                <span className="ml-2 inline-block px-2 py-1 text-xs font-light text-muted-foreground">{data.active.length}</span>
              )}
            </div>

            <ChevronDown size={16} className={`transition-transform opacity-50 ${isSectionVisible ? 'rotate-180' : 'rotate-0'}`} />
          </Button>
          {!!(isSectionVisible && data.active.length) && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  className="w-12 transition duration-300 px-3 ease-in-out }"
                  variant="secondary"
                  size="icon"
                  onClick={() => setOptionsView(!optionsView)}
                >
                  <Settings2 size={16} />
                </Button>
              </TooltipTrigger>
              <TooltipPortal>
                <TooltipContent side="bottom" sideOffset={10}>
                  {t('common:options')}
                </TooltipContent>
              </TooltipPortal>
            </Tooltip>
          )}
          {isSectionVisible && data.canCreate && section.createForm && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button className="w-12 transition duration-300 px-3 ease-in-out }" variant="secondary" size="icon" onClick={createDialog}>
                  <Plus size={16} />
                </Button>
              </TooltipTrigger>
              <TooltipPortal>
                <TooltipContent sideOffset={22} side="right">
                  {t('common:create')}
                </TooltipContent>
              </TooltipPortal>
            </Tooltip>
          )}
        </div>
      </Sticky>
      <div
        className={`grid transition-[grid-template-rows] ${
          isSectionVisible ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        } grid-rows-[0fr] ease-in-outss duration-300`}
      >
        <ul className="overflow-hidden">
          {optionsView ? renderSectionOptions(data) : renderSectionItems(data)}
          {!!(data.inactive.length || data.active.length) && <MenuArchiveToggle archiveToggleClick={archiveToggleClick} />}
        </ul>
      </div>
    </div>
  );
};
