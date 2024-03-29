import { Archive, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/modules/ui/button';

interface MenuArchiveToggleProps {
  archiveToggleClick: () => void;
}

export const MenuArchiveToggle = ({ archiveToggleClick }: MenuArchiveToggleProps) => {
  const { t } = useTranslation();

  return (
    <Button
      onClick={archiveToggleClick}
      variant="secondary"
      className="w-full group mb-1 cursor-pointer bg-background p-0 transition duration-300 focus:outline-none ring-1 ring-inset ring-transparent focus:ring-foreground hover:bg-accent/50 hover:text-accent-foreground"
    >
      <div className="w-14 py-2 flex justify-center items-center">
        <Archive size={16} className="mr-1 items-center" /> 0
      </div>
      <div className="truncate grow text-left p-2 pl-2">{t('common:archived')}</div>
      <div className="p-2">
        <ChevronDown size={16} className="mr-1 transition-transform opacity-50" />
      </div>
    </Button>
  );
};

MenuArchiveToggle.displayName = 'MenuArchiveToggle';
