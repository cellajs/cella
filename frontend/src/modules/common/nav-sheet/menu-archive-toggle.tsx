import { motion } from 'framer-motion';
import { Archive, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/modules/ui/button';

interface MenuArchiveToggleProps {
  archiveToggleClick: () => void;
  inactiveCount: number;
  isArchivedVisible: boolean;
  isSubmenu?: boolean;
}

// TODO isSubmenu and isArchivedVisible can go away and instead use conditional tailwind classes
export const MenuArchiveToggle = ({ archiveToggleClick, inactiveCount, isArchivedVisible, isSubmenu }: MenuArchiveToggleProps) => {
  const { t } = useTranslation();

  return (
    <motion.div layout>
      <Button
        onClick={archiveToggleClick}
        disabled={inactiveCount < 1}
        variant="secondary"
        className={`w-full ${
          isSubmenu ? 'h-8 relative menu-item-sub' : ''
        } group mb-1 cursor-pointer bg-background p-0 transition duration-300 focus:outline-none ring-1 ring-inset ring-transparent focus:ring-foreground hover:bg-accent/50 hover:text-accent-foreground`}
      >
        <div className="w-14 py-2 flex justify-center items-center">
          <Archive size={16} className="mr-0.5 items-center opacity-75" />
        </div>
        <div className="truncate grow text-left p-2 pl-1 opacity-75">
          <span className={`${isSubmenu ? 'text-xs' : 'text-sm'}`}>{t('common:archived')}</span>
          {!isArchivedVisible && <span className="inline-block px-2 py-1 font-light text-xs text-muted-foreground">{inactiveCount}</span>}
        </div>
        <div className="px-3">
          {!!inactiveCount && (
            <ChevronDown size={16} className={`transition-transform opacity-50 ${isArchivedVisible ? 'rotate-180' : 'rotate-0'}`} />
          )}
        </div>
      </Button>
    </motion.div>
  );
};

MenuArchiveToggle.displayName = 'MenuArchiveToggle';
