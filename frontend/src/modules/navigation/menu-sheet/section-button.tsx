import { ChevronDownIcon, PlusIcon, Settings2Icon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { type RefObject, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { TooltipButton } from '~/modules/common/tooltip-button';
import type { UserMenuItem } from '~/modules/me/types';
import type { MenuSectionOptions } from '~/modules/navigation/menu-sheet/section';
import { useNavigationStore } from '~/modules/navigation/navigation-store';
import { useUnseenCount } from '~/modules/seen/use-unseen-count';
import { Button } from '~/modules/ui/button';

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
      <div className="z-10 flex items-center bg-card py-2">
        <motion.div layout="size" transition={{ bounce: 0, duration: 0.2 }} className="flex w-full items-center">
          {/* Main section toggle button */}
          <Button
            onClick={() => toggleSection(options.entityType)}
            className="min-w-0 flex-1 justify-between shadow-none"
            variant="ghost"
            render={<motion.button layout="size" transition={{ bounce: 0, duration: 0.2 }} />}
          >
            <div className="flex items-center">
              <span className="mr-1 flex items-center">{t(options.label)}</span>
              {/* Unseen count badge or item count when section is collapsed */}
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="inline-block px-2 py-1 text-muted-foreground text-xs group-data-[visible=true]/menuSection:hidden"
              >
                {sectionUnseenCount > 0 ? (
                  <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-background px-1 font-bold text-[0.6rem] text-primary leading-none">
                    {sectionUnseenCount > 99 ? '99+' : sectionUnseenCount}
                  </span>
                ) : (
                  data.filter((i) => !i.membership.archived).length
                )}
              </motion.span>
            </div>

            <ChevronDownIcon className="opacity-50 transition-transform duration-200 group-data-[visible=true]/menuSection:rotate-180" />
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
                <TooltipButton toolTipContent={t('c:manage_content')} side="bottom" sideOffset={10}>
                  <Button
                    className="w-10 px-2 shadow-none"
                    variant={isEditing ? 'plain' : 'ghost'}
                    size="icon"
                    onClick={() => toggleIsEditing()}
                  >
                    <Settings2Icon />
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
                <TooltipButton toolTipContent={t('c:create')} sideOffset={22} side="right">
                  <Button
                    ref={createButtonRef}
                    className="w-10 px-2 shadow-none"
                    variant="ghost"
                    size="icon"
                    onClick={() => handleCreateAction(createButtonRef)}
                  >
                    <PlusIcon />
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
