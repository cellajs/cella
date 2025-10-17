import { ChevronDown, PlusIcon, Settings2 } from 'lucide-react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { type RefObject, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import StickyBox from '~/modules/common/sticky-box';
import { TooltipButton } from '~/modules/common/tooltip-button';
import type { UserMenuItem } from '~/modules/me/types';
import type { MenuSectionOptions } from '~/modules/navigation/menu-sheet/section';
import { Button } from '~/modules/ui/button';
import { useNavigationStore } from '~/store/navigation';

interface MenuSectionButtonProps {
  options: MenuSectionOptions;
  isEditing: boolean;
  isSectionVisible: boolean;
  data: UserMenuItem[];
  toggleIsEditing: () => void;
  handleCreateAction?: (ref: RefObject<HTMLButtonElement | null>) => void;
}

export const MenuSectionButton = ({ data, options, isEditing, isSectionVisible, handleCreateAction, toggleIsEditing }: MenuSectionButtonProps) => {
  const { t } = useTranslation();
  const toggleSection = useNavigationStore((state) => state.toggleSection);

  const createButtonRef = useRef(null);

  return (
    <StickyBox className="z-10">
      <div className="flex items-center gap-2 z-10 py-3 pb-1 bg-background justify-between">
        <LayoutGroup>
          <Button onClick={() => toggleSection(options.entityType)} className="w-full justify-between" variant="secondary" asChild>
            <motion.button layout={'size'} transition={{ bounce: 0, duration: 0.2 }}>
              <div className="flex items-center">
                <motion.span layout={'size'} className="flex items-center">
                  {t(options.label)}
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
              <TooltipButton toolTipContent={t('common:manage_content')} side="bottom" sideOffset={10} className="max-sm:hidden">
                <Button className="w-12 px-2" variant={isEditing ? 'plain' : 'secondary'} size="icon" onClick={() => toggleIsEditing()} asChild>
                  <motion.button
                    key={`sheet-menu-settings-${options.entityType}`}
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
            {isSectionVisible && handleCreateAction && (
              <TooltipButton toolTipContent={t('common:create')} sideOffset={22} side="right">
                <Button
                  ref={createButtonRef}
                  className="w-12 px-2"
                  variant="secondary"
                  size="icon"
                  onClick={() => handleCreateAction(createButtonRef)}
                  asChild
                >
                  <motion.button
                    key={`sheet-menu-plus-${options.entityType}`}
                    transition={{ bounce: 0, duration: 0.2 }}
                    initial={{ x: 20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: 20, opacity: 0 }}
                  >
                    <PlusIcon size={16} />
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
