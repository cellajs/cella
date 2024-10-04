import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { ChevronDown, Plus, Settings2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import StickyBox from '~/modules/common/sticky-box';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { Button } from '~/modules/ui/button';
import { useNavigationStore } from '~/store/navigation';
import type { UserMenu, UserMenuItem } from '~/types/common';

interface MenuSectionStickyProp {
  sectionType: keyof UserMenu;
  sectionLabel: string;
  optionsView: boolean;
  isSectionVisible: boolean;
  data: UserMenuItem[];
  toggleOptionsView: () => void;
  createDialog?: () => void;
}

export const MenuSectionSticky = ({
  data,
  sectionType,
  sectionLabel,
  optionsView,
  isSectionVisible,
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
                  {t(sectionLabel)}
                </motion.span>
                {!isSectionVisible && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className="inline-block px-2 py-1 text-xs font-light text-muted-foreground"
                  >
                    {data.filter((i) => !i.membership.archived).length}
                  </motion.span>
                )}
              </div>

              <motion.div initial={{ rotate: 0 }} animate={{ rotate: isSectionVisible ? 180 : 0 }} transition={{ duration: 0.2 }}>
                <ChevronDown size={16} className="opacity-50" />
              </motion.div>
            </motion.button>
          </Button>
          <AnimatePresence mode="popLayout">
            {isSectionVisible && data.length && (
              <TooltipButton toolTipContent={t('common:manage_content')} side="bottom" sideOffset={10}>
                <Button
                  className="w-12 px-3 max-sm:hidden"
                  variant={optionsView ? 'plain' : 'secondary'}
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
              <TooltipButton toolTipContent={t('common:create')} sideOffset={22} side="right">
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
