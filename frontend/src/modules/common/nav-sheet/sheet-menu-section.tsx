import { ChevronDown, Plus } from 'lucide-react';
import type React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/modules/ui/button';
import type { Page, UserMenu } from '~/types';
import { dialog } from '../dialoger/state';
import type { SectionItem } from './sheet-menu';
import { SheetMenuItem } from './sheet-menu-item';
import Sticky from 'react-sticky-el';
import { Tooltip, TooltipContent, TooltipPortal, TooltipTrigger } from '~/modules/ui/tooltip';

interface MenuSectionProps {
  key: string;
  section: SectionItem;
  data: UserMenu[keyof UserMenu];
  isSectionVisible: boolean;
  toggleSection: () => void;
  menutItemClick: () => void;
  itemCount?: number;
}

export const MenuSection: React.FC<MenuSectionProps> = ({ section, data, isSectionVisible, toggleSection, menutItemClick, itemCount }) => {
  const { t } = useTranslation();

  const createDialog = () => {
    dialog(section.createForm, {
      className: 'md:max-w-xl',
      title: t('common:create_organization'),
    });
  };

  const renderSection = (items: Page[]) => {
    if (items.length === 0 && !data.canCreate) {
      return <li className="py-2 text-muted-foreground text-sm text-light text-center">{t('common:no_section_yet', { section: section.type })}</li>;
    }

    if (items.length === 0 && data.canCreate && section.createForm) {
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

    return items.map((item) => <SheetMenuItem key={item.id} item={item} menutItemClick={menutItemClick} />);
  };

  return (
    <div className="mt-2">
      <Sticky scrollElement="#nav-sheet-viewport" stickyClassName="z-10">
        <div className="flex items-center gap-2 z-10 py-2 bg-background justify-between px-1 -mx-1">
          <Button onClick={toggleSection} className="w-full justify-between transition-transform" variant="secondary">
            <div>
              <span className="capitalize">{section.name}</span>
              {!isSectionVisible && <span className="ml-2 inline-block px-2 py-1 text-xs font-light text-muted-foreground">{itemCount}</span>}
            </div>

            <ChevronDown size={16} className={`transition-transform opacity-50 ${isSectionVisible ? 'rotate-180' : 'rotate-0'}`} />
          </Button>
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
      <div className={`grid transition-[grid-template-rows] ${isSectionVisible ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'} grid-rows-[0fr] ease-in-outss duration-300`}>
        <ul className="overflow-hidden">{renderSection(data.active)}</ul>
      </div>
    </div>
  );
};
