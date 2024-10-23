import { motion } from 'framer-motion';
import { Archive, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/modules/ui/button';

interface MenuArchiveToggleProps {
  archiveToggleClick: () => void;
  inactiveCount: number;
}

export const MenuArchiveToggle = ({ archiveToggleClick, inactiveCount }: MenuArchiveToggleProps) => {
  const { t } = useTranslation();

  return (
    <motion.div layout>
      <Button
        onClick={archiveToggleClick}
        disabled={inactiveCount < 1}
        variant="secondary"
        className="w-full group mb-1 cursor-pointer bg-background p-0 transition duration-300 focus-visible:outline-none ring-inset focus-visible:ring-offset-0 focus:ring-foreground hover:bg-accent/50 hover:text-accent-foreground
        group-data-[submenu=true]/archived:h-8 group-data-[submenu=true]/archived:relative group-data-[submenu=true]/archived:menu-item-sub"
      >
        <div className="w-14 py-2 flex justify-center items-center">
          <Archive size={16} className="mr-0.5 items-center opacity-75" />
        </div>
        <div className="truncate grow text-left p-2 pl-1 opacity-75">
          <span className="text-sm group-data-[submenu=true]/archived:text-xs">{t('common:archived')}</span>
          <span
            className="inline-block px-2 py-1 font-light text-xs text-muted-foreground 
          group-data-[archived-visible=true]/archived:hidden"
          >
            {inactiveCount}
          </span>
        </div>
        <div className="px-3">
          <ChevronDown
            size={16}
            className="transition-transform opacity-50 
              group-data-[have-inactive=false]/archived:hidden
              group-data-[archived-visible=true]/archived:rotate-180"
          />
        </div>
      </Button>
    </motion.div>
  );
};

MenuArchiveToggle.displayName = 'MenuArchiveToggle';
