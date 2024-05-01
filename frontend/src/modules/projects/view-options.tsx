import { SlidersHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '~/lib/utils';
import { Button } from '~/modules/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '~/modules/ui/dropdown-menu';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group.tsx';

interface Props {
  className?: string;
}

const viewOptions = [
  {
    id: 'type',
    options: [
      { id: 'feature', label: 'feature' },
      { id: 'bug', label: 'bug' },
      { id: 'chore', label: 'chore' },
    ],
  },
  {
    id: 'status',
    options: [
      { id: '1', label: 'unstarted' },
      { id: '2', label: 'started' },
      { id: '4', label: 'delivered' },
      { id: '5', label: 'reviewed' },
    ],
  },
  {
    id: 'labels',
    options: [
      { id: 'primary', label: 'primary' },
      { id: 'secondary', label: 'secondary' },
      { id: 'colors', label: 'colors' },
    ],
  },
];

const WorkspaceView = ({ className = '' }: Props) => {
  const { t } = useTranslation();

  const handleValueChange = (viewOption: string, values: string[]) => {
    console.log(viewOption, values);
  };
  return (
    <DropdownMenu>
      <TooltipButton toolTipContent={t('common:view_options')}>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className={cn('relative flex', className)}>
            <SlidersHorizontal className="h-4 w-4" />
            <span className="ml-1 max-xl:hidden">{t('common:view')}</span>
          </Button>
        </DropdownMenuTrigger>
      </TooltipButton>
      <DropdownMenuContent align="end" className="min-w-[320px] p-2 gap-2 flex flex-col">
        {viewOptions.map((viewOption) => (
          <ToggleGroup
            key={viewOption.id}
            type="multiple"
            variant="merged"
            //TODO: add value from zustand here                value={}
            className={cn('gap-0 w-full', className)}
            onValueChange={(values) => handleValueChange(viewOption.id, values)}
          >
            {viewOption.options.map(({ id, label }) => (
              <ToggleGroupItem key={id} size="sm" value={id} className="w-full">
                <span className="ml-2 text-xs font-normal">{t(`common:${label}`)}</span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default WorkspaceView;
