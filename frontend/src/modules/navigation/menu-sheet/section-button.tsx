import { ChevronDown, PlusIcon, Settings2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { type RefObject, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { TooltipButton } from '~/modules/common/tooltip-button';
import type { UserMenuItem } from '~/modules/me/types';
import type { MenuSectionOptions } from '~/modules/navigation/menu-sheet/section';
import { useUnseenCount } from '~/modules/seen/use-unseen-count';
import { Button } from '~/modules/ui/button';
import { useNavigationStore } from '~/store/navigation';

interface MenuSectionButtonProps {
  options: MenuSectionOptions;
  isEditing: boolean;
  isSectionVisible: boolean;
  data: UserMenuItem[];
  contextIds: string[];
  toggleIsEditing: () => void;
  handleCreateAction?: (ref: RefObject<HTMLButtonElement | null>) => void;
}

/**
 * Menu section component that is sticky and can contain action buttons.
 */
export const MenuSectionButton = ({
  data,
  contextIds,
  options,
  isEditing,
  isSectionVisible,
  handleCreateAction,
  toggleIsEditing,
}: MenuSectionButtonProps) => {
  const { t } = useTranslation();
  const toggleSection = useNavigationStore((state) => state.toggleSection);

  // Cumulative unseen count for non-archived, non-muted items in this section
  const sectionUnseenCount = useUnseenCount(contextIds);

  const createButtonRef = useRef(null);

  return (
    <div className="sticky top-0 z-10">
      <div className="flex items-center z-10 py-3 pb-1 bg-card">
        <motion.div layout="size" transition={{ bounce: 0, duration: 0.2 }} className="flex items-center w-full">
          {/* Main section toggle button */}
          <Button
            onClick={() => toggleSection(options.entityType)}
            className="flex-1 min-w-0 justify-between shadow-none"
            variant="secondary"
            asChild
          >
            <motion.button layout="size" transition={{ bounce: 0, duration: 0.2 }}>
              <div className="flex items-center">
                <span className="flex items-center">{t(options.label)}</span>
                {/* Unseen count badge or item count when section is collapsed */}
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="inline-block group-data-[visible=true]/menuSection:hidden px-2 py-1 text-xs font-light text-muted-foreground"
                >
                  {sectionUnseenCount > 0 ? (
                    <span className="inline-flex items-center justify-center min-w-4 h-4 rounded-full bg-background text-primary text-[0.6rem] font-bold px-1 leading-none">
                      {sectionUnseenCount > 99 ? '99+' : sectionUnseenCount}
                    </span>
                  ) : (
                    data.filter((i) => !i.membership.archived).length
                  )}
                </motion.span>
              </div>

              <ChevronDown
                size={16}
                className="opacity-50 transition-transform duration-200 group-data-[visible=true]/menuSection:rotate-180"
              />
            </motion.button>
          </Button>

          {/* Settings button */}
          <AnimatePresence>
            {isSectionVisible && !!data.length && (
              <motion.div
                key={`sheet-menu-settings-${options.entityType}`}
                initial={{ width: 0, opacity: 0, marginLeft: 0 }}
                animate={{ width: '2.5rem', opacity: 1, marginLeft: '0.5rem' }}
                exit={{ width: 0, opacity: 0, marginLeft: 0 }}
                transition={{ bounce: 0, duration: 0.2 }}
                className="shrink-0 max-sm:hidden"
              >
                <TooltipButton toolTipContent={t('common:manage_content')} side="bottom" sideOffset={10}>
                  <Button
                    className="w-10 px-2 shadow-none"
                    variant={isEditing ? 'plain' : 'secondary'}
                    size="icon"
                    onClick={() => toggleIsEditing()}
                  >
                    <Settings2 size={16} />
                  </Button>
                </TooltipButton>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Create button */}
          <AnimatePresence>
            {isSectionVisible && handleCreateAction && (
              <motion.div
                key={`sheet-menu-plus-${options.entityType}`}
                initial={{ width: 0, opacity: 0, marginLeft: 0 }}
                animate={{ width: '2.5rem', opacity: 1, marginLeft: '0.5rem' }}
                exit={{ width: 0, opacity: 0, marginLeft: 0 }}
                transition={{ bounce: 0, duration: 0.2 }}
                className="shrink-0"
              >
                <TooltipButton toolTipContent={t('common:create')} sideOffset={22} side="right">
                  <Button
                    ref={createButtonRef}
                    className="w-10 px-2 shadow-none"
                    variant="secondary"
                    size="icon"
                    onClick={() => handleCreateAction(createButtonRef)}
                  >
                    <PlusIcon size={16} />
                  </Button>
                </TooltipButton>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
};
