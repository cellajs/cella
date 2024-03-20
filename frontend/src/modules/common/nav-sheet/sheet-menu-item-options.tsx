import { Archive, BellOff, GripVertical } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import { Button } from '~/modules/ui/button';
import { type Page } from '~/types';

interface SheetMenuItemProps {
  item: Page;
}

export const SheetMenuItemOptions = ({ item }: SheetMenuItemProps) => {
  const { t } = useTranslation();

  return (
    <div className="group mb-1 flex h-14 w-full cursor-pointer items-start justify-start rounded p-0 transition duration-300 focus:outline-none ring-1 ring-inset ring-muted/25 focus:ring-foreground hover:bg-accent/50 hover:text-accent-foreground">
      <AvatarWrap className="m-2" type="organization" id={item.id} name={item.name} url={item.thumbnailUrl} />
      <div className="truncate grow p-2 pl-2 text-left">
        <div className="truncate text-foreground/50 leading-5">{item.name}</div>
        <div className="flex items-center gap-4 mt-1">
        <Button variant="link" size="sm" className="p-0 font-light text-xs h-4 leading-3" aria-label="Toggle archive">
            <Archive size={14} className="mr-1" />
            {t('common:archive')}
          </Button>
          <Button variant="link" size="sm" className="p-0 font-light text-xs h-4 leading-3" aria-label="Toggle Mute">
            <BellOff size={14} className="mr-1" />
            {t('common:mute')}
          </Button>
        </div>
      </div>
      <div className="p-2 cursor-move">
        <GripVertical size={16} className="mt-3 mr-1 opacity-50 transition-opacity duration-300 ease-in-out group-hover:opacity-100" />
      </div>
    </div>
  );
};

SheetMenuItemOptions.displayName = 'SheetMenuItemOptions';
