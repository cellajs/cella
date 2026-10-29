import { ArchiveIcon, ChevronDownIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CountBadge } from '~/modules/common/count-badge';
import { SubmenuConnector } from '~/modules/navigation/menu-sheet/submenu-connector';
import { useUnseenCount } from '~/modules/seen/use-unseen-count';
import { Button } from '~/modules/ui/button';

interface MenuSheetArchivedToggleProps {
  onToggle: () => void;
  archivedCount: number;
  archivedChannelIds?: string[];
}

const emptyChannelIds: string[] = [];

export function MenuSheetArchivedToggle({ onToggle, archivedCount, archivedChannelIds = emptyChannelIds }: MenuSheetArchivedToggleProps) {
  const { t } = useTranslation();
  const archivedUnseenCount = useUnseenCount(archivedChannelIds);

  return (
    <div className="relative">
      <Button
        onClick={onToggle}
        disabled={archivedCount < 1}
        variant="ghost"
        className="w-full gap-0 p-0 ring-inset ring-offset-0 transition duration-300 group-data-[submenu=true]/archived:h-8"
      >
        <div className="flex w-12 items-center justify-center py-2">
          <ArchiveIcon className="ml-2 size-5 opacity-75 group-data-[submenu=true]/archived:size-3.5" />
        </div>
        <div className="grow truncate p-2 text-left text-muted-foreground">
          <span className="text-sm group-data-[submenu=true]/archived:text-xs">{t('c:archived')}</span>
          <span className="inline-block px-2 py-1 text-faint-foreground text-xs group-data-[archived-visible=true]/archived:hidden">
            {archivedUnseenCount > 0 ? <CountBadge count={archivedUnseenCount} className="inline-flex" /> : archivedCount}
          </span>
        </div>
        <div className="px-3">
          <ChevronDownIcon className="opacity-50 transition-transform group-data-[has-archived=false]/archived:hidden group-data-[submenu=true]/archived:size-3.5 group-data-[archived-visible=true]/archived:rotate-180" />
        </div>
      </Button>
      {/* In a submenu it joins the last row above: 0.625rem below that row's avatar, 0.5625rem above the icon */}
      <SubmenuConnector className="-top-2.5 hidden h-4.75 group-data-[submenu=true]/archived:flex" />
    </div>
  );
}
