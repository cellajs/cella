import { ArchiveIcon, ChevronDownIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { useUnseenCount } from '~/modules/seen/use-unseen-count';
import { Button } from '~/modules/ui/button';

interface SectionArchiveButtonProps {
  archiveToggleClick: () => void;
  archivedCount: number;
  archivedChannelIds?: string[];
}

const EMPTY_CHANNEL_IDS: string[] = [];

export const SectionArchiveButton = ({
  archiveToggleClick,
  archivedCount,
  archivedChannelIds = EMPTY_CHANNEL_IDS,
}: SectionArchiveButtonProps) => {
  const { t } = useTranslation();
  const archivedUnseenCount = useUnseenCount(archivedChannelIds);

  return (
    <motion.div layout>
      <Button
        onClick={archiveToggleClick}
        disabled={archivedCount < 1}
        variant="secondary"
        className="group focus-effect w-full bg-transparent p-0 shadow-none ring-inset ring-offset-0 transition duration-300 hover:bg-accent/50 hover:text-accent-foreground group-data-[submenu=true]/archived:h-8"
      >
        <div className="flex w-12 items-center justify-center py-2">
          <ArchiveIcon className="ml-2 items-center opacity-75" />
        </div>
        <div className="grow truncate p-2 pl-2 text-left opacity-75">
          <span className="text-sm group-data-[submenu=true]/archived:text-xs">{t('c:archived')}</span>
          <span className="inline-block px-2 py-1 text-muted-foreground text-xs group-data-[archived-visible=true]/archived:hidden">
            {archivedUnseenCount > 0 ? (
              <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-background px-1 font-bold text-[0.6rem] text-primary leading-none">
                {archivedUnseenCount > 99 ? '99+' : archivedUnseenCount}
              </span>
            ) : (
              archivedCount
            )}
          </span>
        </div>
        <div className="px-3">
          <ChevronDownIcon className="opacity-50 transition-transform group-data-[has-inactive=false]/archived:hidden group-data-[archived-visible=true]/archived:rotate-180" />
        </div>
      </Button>
    </motion.div>
  );
};

SectionArchiveButton.displayName = 'SectionArchiveButton';
