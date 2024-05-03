import { SlidersHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '~/lib/utils';
import { Button } from '~/modules/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '~/modules/ui/dropdown-menu';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group.tsx';
import { useWorkspaceStore } from '~/store/workspace.ts';
import { useContext } from 'react';
import { WorkspaceContext } from '../workspaces/index.tsx';

interface Props {
  className?: string;
}

const viewOptions = [
  {
    id: 'type' as const,
    options: ['feature', 'bug', 'chore'],
  },
  {
    id: 'status' as const,
    options: ['iced', 'unstarted', 'started', 'finished', 'delivered', 'reviewed', 'accepted'],
  },
  {
    id: 'labels' as const,
    options: ['primary', 'secondary'],
  },
];

const WorkspaceView = ({ className = '' }: Props) => {
  const { t } = useTranslation();
  const { workspaces, changeViewOptionsLabels, changeViewOptionsStatus, changeViewOptionsTypes } = useWorkspaceStore();
  const { workspace } = useContext(WorkspaceContext);
  const workspaceId = workspace.id;
  const handleValueChange = (viewOption: string, values: string[]) => {
    if (viewOption === 'type') changeViewOptionsTypes(workspaceId, values as ('feature' | 'bug' | 'chore')[]);
    if (viewOption === 'status')
      changeViewOptionsStatus(workspaceId, values as ('iced' | 'unstarted' | 'started' | 'finished' | 'delivered' | 'reviewed' | 'accepted')[]);
    if (viewOption === 'labels') changeViewOptionsLabels(workspaceId, values as ('primary' | 'secondary')[]);
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
            value={workspaces[workspaceId].viewOptions[`${viewOption.id}`]}
            className={cn('gap-0 w-full', className)}
            onValueChange={(values) => handleValueChange(viewOption.id, values)}
          >
            {viewOption.options.map((option) => (
              <ToggleGroupItem key={option} size="sm" value={option} className="w-full">
                <span className="ml-2 text-xs font-normal">{t(`common:${option}`)}</span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default WorkspaceView;
