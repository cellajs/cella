import { ChevronDown, Plus, Settings2 } from 'lucide-react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import StickyBox from '~/modules/common/sticky-box';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { Button } from '~/modules/ui/button';
import type { UserMenu, UserMenuItem } from '~/modules/users/types';
import { useNavigationStore } from '~/store/navigation';

interface MenuSectionButtonProps {
  sectionType: keyof UserMenu;
  sectionLabel: string;
  isEditing: boolean;
  isSectionVisible: boolean;
  data: UserMenuItem[];
  toggleIsEditing: () => void;
  createDialog?: () => void;
}

export const MenuSectionButton = ({
  data,
  sectionType,
  sectionLabel,
  isEditing,
  isSectionVisible,
  createDialog,
  toggleIsEditing,
}: MenuSectionButtonProps) => {
  const { t } = useTranslation();
  const toggleSection = useNavigationStore((state) => state.toggleSection);

  return (
    <StickyBox className="z-10">
      <div className="flex items-center gap-2 z-10 py-3 pb-1 bg-background justify-between px-1 -mx-1">
        <LayoutGroup>
          <Button onClick={() => toggleSection(sectionType)} className="w-full justify-between" variant="secondary" asChild>
            <motion.button layout={'size'} transition={{ bounce: 0, duration: 0.2 }}>
              <div className="flex items-center">
                <motion.span layout={'size'} className="flex items-center">
                  {t(sectionLabel)}
                </motion.span>
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="inline-block group-data-[visible=true]/menuSection:hidden px-2 py-1 text-xs font-light text-muted-foreground"
                >
                  {data.filter((i) => !i.membership.archived).length}
                </motion.span>
              </div>

              <motion.div initial={{ rotate: 0 }} transition={{ duration: 0.2 }}>
                <ChevronDown size={16} className="opacity-50 group-data-[visible=true]/menuSection:rotate-180" />
              </motion.div>
            </motion.button>
          </Button>
          <AnimatePresence mode="popLayout">
            {isSectionVisible && data.length && (
              <TooltipButton toolTipContent={t('common:manage_content')} side="bottom" sideOffset={10}>
                <Button
                  className="w-12 px-2 max-sm:hidden"
                  variant={isEditing ? 'plain' : 'secondary'}
                  size="icon"
                  onClick={() => toggleIsEditing()}
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
                <Button className="w-12 px-2" variant="secondary" size="icon" onClick={createDialog} asChild>
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
