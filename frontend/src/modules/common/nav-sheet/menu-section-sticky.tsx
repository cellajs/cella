import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { ChevronDown, Plus, Settings2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import StickyBox from 'react-sticky-box';
import { Button } from '~/modules/ui/button';
import { useNavigationStore } from '~/store/navigation';
import type { UserMenuItem } from '~/types';
import { TooltipButton } from '../tooltip-button';

interface MenuSectionStickyProp {
  sectionType: 'workspaces' | 'organizations';
  isSectionVisible: boolean;
  data: UserMenuItem[];
  globalDragging: boolean;
  toggleOptionsView: () => void;
  createDialog?: () => void;
}

export const MenuSectionSticky = ({
  data,
  sectionType,
  isSectionVisible,
  globalDragging,
  createDialog,
  toggleOptionsView,
}: MenuSectionStickyProp) => {
  const { t } = useTranslation();
  const { toggleSection } = useNavigationStore();

  return (
    <StickyBox className="z-10">
      <div className="flex items-center gap-2 z-10 py-3 pb-2 bg-background justify-between px-1 -mx-1">
        <LayoutGroup>
          <Button onClick={() => toggleSection(sectionType)} className="w-full justify-between" variant="secondary" asChild>
            <motion.button layout={'size'} transition={{ bounce: 0, duration: 0.15 }}>
              <div className="flex items-center">
                <motion.span layout={'size'} className="flex items-center">
                  {t(`common:${sectionType}`)}
                </motion.span>
                {!isSectionVisible && (
                  <span className="inline-block px-2 py-1 text-xs font-light text-muted-foreground">
                    {data.filter((i) => !i.membership.archived).length}
                  </span>
                )}
              </div>

              <ChevronDown size={16} className={`transition-transform opacity-50 ${isSectionVisible ? 'rotate-180' : 'rotate-0'}`} />
            </motion.button>
          </Button>
          <AnimatePresence mode="popLayout">
            {isSectionVisible && (
              <TooltipButton toolTipContent={t('common:manage')} side="bottom" sideOffset={10}>
                <Button
                  disabled={!data.length}
                  className="w-12 px-3"
                  variant={`${globalDragging ? 'plain' : 'secondary'}`}
                  size="icon"
                  onClick={() => toggleOptionsView()}
                  asChild
                >
                  <motion.button
                    key={`sheet-menu-settings-${sectionType}`}
                    transition={{ bounce: 0, duration: 0.2 }}
                    initial={{ x: 20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: 20, opacity: 0, transition: { bounce: 0, duration: 0.1 } }}
                  >
                    <Settings2 size={16} />
                  </motion.button>
                </Button>
              </TooltipButton>
            )}
          </AnimatePresence>
          <AnimatePresence mode="popLayout">
            {isSectionVisible && createDialog && (
              <TooltipButton toolTipContent={t('common:create')} sideOffset={22} side="right" portal>
                <Button className="w-12 px-3" variant="secondary" size="icon" onClick={createDialog} asChild>
                  <motion.button
                    key={`sheet-menu-plus-${sectionType}`}
                    transition={{ bounce: 0, duration: 0.2, transition: { bounce: 0, duration: 0.1 } }}
                    initial={{ x: 20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: 20, opacity: 0 }}
                  >
                    <Plus size={16} />
                  </motion.button>
                </Button>
              </TooltipButton>
            )}
          </AnimatePresence>
        </LayoutGroup>
      </div>
    </StickyBox>
  );
};
