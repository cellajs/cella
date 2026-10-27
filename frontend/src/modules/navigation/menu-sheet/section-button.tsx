import { ChevronDownIcon, PlusIcon, Settings2Icon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { type RefObject, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { CountBadge } from '~/modules/common/count-badge';
import { TooltipButton } from '~/modules/common/tooltip-button';
import type { UserMenuItem } from '~/modules/me/types';
import { widenMotion } from '~/modules/navigation/menu-sheet/helpers/widen-motion';
import type { MenuSectionOptions } from '~/modules/navigation/menu-sheet/section';
import { useNavigationStore } from '~/modules/navigation/navigation-store';
import { useUnseenCount } from '~/modules/seen/use-unseen-count';
import { Button } from '~/modules/ui/button';

interface MenuSheetSectionButtonProps {
  options: MenuSectionOptions;
  isEditing: boolean;
  isCollapsible: boolean;
  isSectionVisible: boolean;
  items: UserMenuItem[];
  channelIds: string[];
  onToggleEditing: () => void;
  onCreate?: (ref: RefObject<HTMLButtonElement | null>) => void;
}

export function MenuSheetSectionButton({
  items,
  channelIds,
  options,
  isEditing,
  isCollapsible,
  isSectionVisible,
  onCreate,
  onToggleEditing,
}: MenuSheetSectionButtonProps) {
  const { t } = useTranslation();
  const setSectionOpen = useNavigationStore((state) => state.setSectionOpen);

  // Cumulative over the section's non-archived, non-muted items.
  const sectionUnseenCount = useUnseenCount(channelIds);

  const createButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="sticky top-0 z-10 flex items-center bg-card pt-2">
      {isCollapsible ? (
        <Button onClick={() => setSectionOpen(options.entityType, !isSectionVisible)} className="min-w-0 flex-1 justify-between" variant="ghost">
          <div className="flex items-center">
            <span className="mr-1 flex items-center">{t(options.label)}</span>
            {/* Unseen count, or the item count while the section is collapsed. */}
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="inline-block px-2 py-1 text-muted-foreground text-xs group-data-[visible=true]/menu-section:hidden"
            >
              {sectionUnseenCount > 0 ? (
                <CountBadge count={sectionUnseenCount} className="inline-flex" />
              ) : (
                items.filter((item) => !item.membership.archived).length
              )}
            </motion.span>
          </div>

          <ChevronDownIcon className="opacity-50 transition-transform duration-200 group-data-[visible=true]/menu-section:rotate-180" />
        </Button>
      ) : (
        // Matches the toggle's text box, so the label sits where a collapsible section shows it
        <div className="flex h-10 min-w-0 flex-1 items-center whitespace-nowrap px-3 font-medium text-sm">{t(options.label)}</div>
      )}

      {/* initial={false} so opening the sheet doesn't widen every open section at once, only a toggle does */}
      <AnimatePresence initial={false}>
        {isSectionVisible && !!items.length && (
          <motion.div key={`settings-${options.entityType}`} {...widenMotion} className="shrink-0 max-sm:hidden">
            <TooltipButton toolTipContent={t('c:manage_content')} side="bottom" sideOffset={10}>
              <Button variant={isEditing ? 'plain' : 'ghost'} size="icon" onClick={onToggleEditing}>
                <Settings2Icon className="size-5" />
              </Button>
            </TooltipButton>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {isSectionVisible && onCreate && (
          <motion.div key={`create-${options.entityType}`} {...widenMotion} className="shrink-0">
            <TooltipButton toolTipContent={t('c:create')} sideOffset={22} side="right">
              <Button ref={createButtonRef} variant="ghost" size="icon" onClick={() => onCreate(createButtonRef)}>
                <PlusIcon className="size-5" />
              </Button>
            </TooltipButton>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
