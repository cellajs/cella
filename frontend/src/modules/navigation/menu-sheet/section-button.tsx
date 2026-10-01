import { ChevronDownIcon, PlusIcon, Settings2Icon } from 'lucide-react';
import { motion } from 'motion/react';
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
  channelIds: string[];
  toggleIsEditing: () => void;
  handleCreateAction?: (ref: RefObject<HTMLButtonElement | null>) => void;
}

export function MenuSectionButton({
  data,
  channelIds,
  options,
  isEditing,
  isSectionVisible,
  handleCreateAction,
  toggleIsEditing,
}: MenuSectionButtonProps) {
  const { t } = useTranslation();
  const toggleSection = useNavigationStore((state) => state.toggleSection);

  // Cumulative over the section's non-archived, non-muted items.
  const sectionUnseenCount = useUnseenCount(channelIds);

  const createButtonRef = useRef(null);

  return (
    <div className="sticky top-0 z-10">
      <div className="z-10 flex items-center bg-card py-2">
        <div className="flex w-full items-center">
          <Button onClick={() => toggleSection(options.entityType)} className="min-w-0 flex-1 justify-between shadow-none" variant="ghost">
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
                  <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 font-bold text-2xs text-primary-foreground leading-none">
                    {sectionUnseenCount > 99 ? '99+' : sectionUnseenCount}
                  </span>
                ) : (
                  data.filter((i) => !i.membership.archived).length
                )}
              </motion.span>
            </div>

            <ChevronDownIcon className="opacity-50 transition-transform duration-200 group-data-[visible=true]/menu-section:rotate-180" />
          </Button>

          {/* Enter by transform and opacity, which skip layout; leaving is instant, so the toggle widens in one step */}
          {isSectionVisible && !!data.length && (
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ bounce: 0, duration: 0.2 }}
              className="ml-2 shrink-0 max-sm:hidden"
            >
              <TooltipButton toolTipContent={t('c:manage_content')} side="bottom" sideOffset={10}>
                <Button className="w-10 px-2 shadow-none" variant={isEditing ? 'plain' : 'ghost'} size="icon" onClick={() => toggleIsEditing()}>
                  <Settings2Icon className="size-5" />
                </Button>
              </TooltipButton>
            </motion.div>
          )}

          {isSectionVisible && handleCreateAction && (
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ bounce: 0, duration: 0.2 }}
              className="ml-2 shrink-0"
            >
              <TooltipButton toolTipContent={t('c:create')} sideOffset={22} side="right">
                <Button
                  ref={createButtonRef}
                  className="w-10 px-2 shadow-none"
                  variant="ghost"
                  size="icon"
                  onClick={() => handleCreateAction(createButtonRef)}
                >
                  <PlusIcon className="size-5" />
                </Button>
              </TooltipButton>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
