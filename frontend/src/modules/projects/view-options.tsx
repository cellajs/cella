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
import { taskTypes } from './create-task-form.tsx';

interface Props {
  className?: string;
}


export const viewOptions = { type: taskTypes, labels: ['primary', 'secondary'], status: ['unstarted', 'started', 'finished', 'delivered', 'reviewed'] };

export type ViewOptions = typeof viewOptions;

const WorkspaceView = ({ className = '' }: Props) => {
  const { t } = useTranslation();
  const { getWorkspaceViewOptions, setWorkspaceViewOptions } = useWorkspaceStore();
  const { workspace } = useContext(WorkspaceContext);
  const workspaceId = workspace.id;
  const handViewOptionsChange = (viewOption: keyof ViewOptions , values: string[]) => {
    setWorkspaceViewOptions(workspaceId, viewOption, values);
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
      {Object.entries(viewOptions).map(([key, options]) => (
          <ToggleGroup
            key={key}
            type="multiple"
            variant="merged"
            value={getWorkspaceViewOptions(workspaceId)[key as keyof ViewOptions]}
            className={cn('gap-0 w-full', className)}
            onValueChange={(values) => handViewOptionsChange(key as keyof ViewOptions, values)}
          >
            {options.map((option) => (
              <ToggleGroupItem key={option} size="sm" value={option} className="w-full">
                <span className="text-xs font-normal">{t(`common:${option}`)}</span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default WorkspaceView;
