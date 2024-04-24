import { SlidersHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '~/lib/utils';
import { Button } from '~/modules/ui/button';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from '~/modules/ui/dropdown-menu';
import { TooltipButton } from '~/modules/common/tooltip-button';


interface Props{
  className?: string;
}

const WorkspaceView = ({ className = '' }: Props) => {
  const { t } = useTranslation();

  return (
    <DropdownMenu

    >
      <TooltipButton toolTipContent={t('common:view_options')}>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className={cn('relative flex', className)}>
            <SlidersHorizontal className="h-4 w-4" />
            <span className="ml-1 max-xl:hidden">{t('common:view')}</span>
          </Button>
        </DropdownMenuTrigger>
      </TooltipButton>
      <DropdownMenuContent align="end" className="min-w-[220px] pt-2" collisionPadding={16}>
        <div className="overflow-y-auto relative">
            <DropdownMenuCheckboxItem
              className="mx-1"
              checked={false}
            >
              No labels
            </DropdownMenuCheckboxItem>
          <div className="sticky bottom-0 h-[8px] bg-gradient-to-t from-popover" />
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default WorkspaceView;
