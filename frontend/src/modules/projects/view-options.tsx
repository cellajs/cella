import { cva } from 'class-variance-authority';
import { SlidersHorizontal } from 'lucide-react';
import { useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '~/lib/utils';
import { Button } from '~/modules/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '~/modules/ui/dropdown-menu';
import { useWorkspaceStore } from '~/store/workspace.ts';
import { TooltipButton } from '../common/tooltip-button.tsx';
import { Badge } from '../ui/badge.tsx';
import ThreeStateSwitch from '../ui/three-state-switch.tsx';
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group.tsx';
import { WorkspaceContext } from '../workspaces/index.tsx';
import { taskTypes } from './create-task-form.tsx';
import { DualSlider } from './view-status-dual-slider.tsx';

interface Props {
  className?: string;
}

// View options for the workspace
export const viewOptions = {
  type: taskTypes,
  labels: ['primary', 'secondary'],
  status: ['unstarted', 'started', 'finished', 'delivered', 'reviewed'],
};

const statusesForDualSelect = ['iced', 'unstarted', 'started', 'finished', 'delivered', 'reviewed', 'accepted'];

// Variants for bottom border highlight
const variants = cva('border-b-2', {
  variants: {
    labels: { primary: 'border-b-foreground hover:border-b-foreground/70', secondary: 'border-b-foreground/50 hover:border-b-foreground/20' },
    type: {
      feature: 'border-b-amber-400 hover:border-b-amber-400/60',
      chore: 'border-b-slate-400 hover:border-b-slate-400/60',
      bug: 'border-b-red-400 hover:border-b-red-400/60',
    },
    status: {
      unstarted: 'border-b-slate-300/60 hover:border-b-slate-300/40',
      started: 'border-b-slate-500/60 hover:border-b-slate-500/40',
      finished: 'border-b-lime-500/60 hover:border-b-lime-500/40',
      delivered: 'border-b-yellow-500/60 hover:border-b-yellow-500/40',
      reviewed: 'border-b-orange-500/60 hover:border-b-orange-500/40',
    },
  },
});

export type ViewOptions = typeof viewOptions;

const WorkspaceView = ({ className = '' }: Props) => {
  const { t } = useTranslation();
  const { getWorkspaceViewOptions, setWorkspaceViewOptions } = useWorkspaceStore();
  const { workspace } = useContext(WorkspaceContext);
  const [workspaceId, setWorkspaceId] = useState(workspace.id);
  const [innerViewOptions, setInnerViewOptions] = useState(getWorkspaceViewOptions(workspaceId));

  const [showToolTip, setShowToolTip] = useState(false);
  const [firstFocus, setFirstFocus] = useState(false);

  const currentLength = Object.values(innerViewOptions).flat().length;
  const [switchState, setSwitchState] = useState<'none' | 'partly' | 'all'>(currentLength < 1 ? 'none' : currentLength === 10 ? 'all' : 'partly');

  const { status } = innerViewOptions;
  const startIndex = Math.max(1, statusesForDualSelect.indexOf(status[0]));
  const endIndex = Math.min(statusesForDualSelect.length - 2, statusesForDualSelect.indexOf(status[status.length - 1]));

  const handleViewOptionsChange = (viewOption: keyof ViewOptions, values: string[]) => {
    const newInnerViewOptions = { ...innerViewOptions };
    newInnerViewOptions[viewOption] = values;
    setInnerViewOptions(newInnerViewOptions);
    setWorkspaceViewOptions(workspaceId, viewOption, values);
  };

  const handleSliderChange = (values: number[]) => {
    if (values[0] === 1 && values[1] === 1) return handleViewOptionsChange('status', ['unstarted']);
    if (values[0] === 5 && values[1] === 5) return handleViewOptionsChange('status', ['reviewed']);
    if (values[0] === 0 && values[1] === 0) return handleViewOptionsChange('status', []);
    const selectedStatuses = statusesForDualSelect.slice(values[0], values[1] + 1);
    handleViewOptionsChange('status', selectedStatuses);
  };

  useEffect(() => {
    const currentLength = Object.values(innerViewOptions).flat().length;
    const totalLength = Object.values(viewOptions).flat().length;

    if (currentLength === 0) {
      setSwitchState('none');
    } else if (currentLength === totalLength) {
      setSwitchState('all');
    } else {
      setSwitchState('partly');
    }
  }, [innerViewOptions]);

  useEffect(() => {
    if (switchState === 'partly') return;
    Object.entries(viewOptions).map(([key, value]) => {
      return setWorkspaceViewOptions(workspaceId, key as keyof ViewOptions, switchState === 'all' ? value : []);
    });
    setInnerViewOptions(getWorkspaceViewOptions(workspaceId));
    return;
  }, [switchState]);

  useEffect(() => {
    setWorkspaceId(workspace.id);
    setInnerViewOptions(getWorkspaceViewOptions(workspace.id));
  }, [workspace]);

  return (
    <DropdownMenu>
      <TooltipButton disabled={showToolTip} toolTipContent={t('common:view_options')}>
        <DropdownMenuTrigger asChild>
          <Button
            onFocus={() => setFirstFocus(true)}
            onMouseLeave={() => {
              if (firstFocus) setShowToolTip(true);
            }}
            onMouseEnter={() => setShowToolTip(false)}
            variant="outline"
            className={cn('relative flex', className)}
          >
            {switchState !== 'all' && <Badge className="absolute -right-1 -top-1 flex h-2 w-2 justify-center p-0" />}
            <SlidersHorizontal className="h-4 w-4" />
            <span className="ml-1 max-xl:hidden">{t('common:view')}</span>
          </Button>
        </DropdownMenuTrigger>
      </TooltipButton>

      <DropdownMenuContent align="end" className="min-w-[320px] p-2 gap-2 flex flex-col">
        {Object.entries(viewOptions)
          .filter(([key]) => key !== 'status')
          .map(([key, options]) => (
            <ToggleGroup
              key={key}
              type="multiple"
              variant="merged"
              value={getWorkspaceViewOptions(workspaceId)[key as keyof ViewOptions]}
              className={cn('gap-0 w-full', className)}
              onValueChange={(values) => handleViewOptionsChange(key as keyof ViewOptions, values)}
            >
              {options.map((option) => (
                <ToggleGroupItem
                  key={option}
                  size="sm"
                  value={option}
                  className={`w-full ${
                    getWorkspaceViewOptions(workspaceId)[key as keyof ViewOptions]?.includes(option) ? variants({ [key]: option }) : 'pb-[1px]'
                  }`}
                >
                  <span className="text-xs font-normal">{t(`common:${option}`)}</span>
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          ))}
        <DualSlider
          min={1}
          max={5}
          step={1}
          value={[startIndex, endIndex]}
          onValueChange={handleSliderChange}
          formatLabel={(value) => statusesForDualSelect[value]}
        />
        <ThreeStateSwitch
          disableIndex={switchState === 'all' || switchState === 'none' ? [1] : []}
          value={switchState}
          switchValues={[
            { id: 0, value: 'none', label: 'Selected none' },
            { id: 1, value: 'partly', label: 'Partly secelted' },
            { id: 2, value: 'all', label: 'Selected all' },
          ]}
          onChange={(newValue: string) => setSwitchState(newValue as 'none' | 'partly' | 'all')}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default WorkspaceView;
