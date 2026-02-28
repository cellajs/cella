import { ArchiveIcon, ChevronDownIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { useUnseenCount } from '~/modules/seen/use-unseen-count';
import { Button } from '~/modules/ui/button';

interface SectionArchiveButtonProps {
  archiveToggleClick: () => void;
  archivedCount: number;
  archivedContextIds?: string[];
}

export const SectionArchiveButton = ({
  archiveToggleClick,
  archivedCount,
  archivedContextIds = [],
}: SectionArchiveButtonProps) => {
  const { t } = useTranslation();
  const archivedUnseenCount = useUnseenCount(archivedContextIds);

  return (
    <motion.div layout>
      <Button
        onClick={archiveToggleClick}
        disabled={archivedCount < 1}
        variant="secondary"
        className="w-full group bg-transparent p-0 transition duration-300 focus-effect ring-inset ring-offset-0 hover:bg-accent/50 hover:text-accent-foreground
        group-data-[submenu=true]/archived:h-8 shadow-none"
      >
        <div className="w-12 py-2 flex justify-center items-center">
          <ArchiveIcon size={16} className="ml-2 items-center opacity-75" />
        </div>
        <div className="truncate grow text-left p-2 pl-2 opacity-75">
          <span className="text-sm group-data-[submenu=true]/archived:text-xs">{t('common:archived')}</span>
          <span
            className="inline-block px-2 py-1 font-light text-xs text-muted-foreground 
          group-data-[archived-visible=true]/archived:hidden"
          >
            {archivedUnseenCount > 0 ? (
              <span className="inline-flex items-center justify-center min-w-4 h-4 rounded-full bg-background text-primary text-[0.6rem] font-bold px-1 leading-none">
                {archivedUnseenCount > 99 ? '99+' : archivedUnseenCount}
              </span>
            ) : (
              archivedCount
            )}
          </span>
        </div>
        <div className="px-3">
          <ChevronDownIcon
            size={16}
            className="transition-transform opacity-50 
              group-data-[has-inactive=false]/archived:hidden
              group-data-[archived-visible=true]/archived:rotate-180"
          />
        </div>
      </Button>
    </motion.div>
  );
};

SectionArchiveButton.displayName = 'SectionArchiveButton';
