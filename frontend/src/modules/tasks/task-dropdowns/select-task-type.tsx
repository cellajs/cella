import { useSearch } from '@tanstack/react-router';
import { Bolt, Bug, Check, Star } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { queryClient } from '~/lib/router';
import { dropdowner } from '~/modules/common/dropdowner/state';
import { Kbd } from '~/modules/common/kbd';
import { useTaskMutation } from '~/modules/common/query-client-provider/tasks';
import type { TaskType } from '~/modules/tasks/create-task-form';
import { inNumbersArray } from '~/modules/tasks/helpers';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '~/modules/ui/command';
import { useWorkspaceQuery } from '~/modules/workspaces/helpers/use-workspace';
import { WorkspaceRoute } from '~/routes/workspaces';
import { useWorkspaceStore } from '~/store/workspace';
import { cn } from '~/utils/cn';

type Type = {
  value: (typeof taskTypes)[number]['value'];
  label: string;
  icon: () => JSX.Element;
};

export const taskTypes = [
  { value: 'feature', label: 'Feature', icon: () => <Star size={16} className="fill-amber-400 text-amber-500" /> },
  { value: 'chore', label: 'Chore', icon: () => <Bolt size={16} className="fill-slate-400 text-slate-500" /> },
  { value: 'bug', label: 'Bug', icon: () => <Bug size={16} className="fill-red-400 text-red-500" /> },
] as const;

export interface SelectTaskTypeProps {
  currentType: TaskType;
  projectId: string;
  className?: string;
}

const SelectTaskType = ({ currentType, projectId, className = '' }: SelectTaskTypeProps) => {
  const { t } = useTranslation();
  const { focusedTaskId: storeFocusedId } = useWorkspaceStore();
  const {
    data: { workspace },
  } = useWorkspaceQuery();
  const [selectedType, setSelectedType] = useState<Type | undefined>(taskTypes[taskTypes.findIndex((type) => type.value === currentType)]);
  const [searchValue, setSearchValue] = useState('');
  const isSearching = searchValue.length > 0;
  const taskMutation = useTaskMutation();

  const { taskIdPreview } = useSearch({
    from: WorkspaceRoute.id,
  });

  const focusedTaskId = useMemo(() => (taskIdPreview ? taskIdPreview : storeFocusedId), [storeFocusedId, taskIdPreview]);

  const changeTaskType = async (newType: TaskType) => {
    if (!focusedTaskId) return;

    try {
      await taskMutation.mutateAsync({
        id: focusedTaskId,
        orgIdOrSlug: workspace.organizationId,
        key: 'type',
        data: newType,
        projectId,
      });
      if (taskIdPreview) await queryClient.invalidateQueries({ refetchType: 'active' });
    } catch (err) {
      toast.error(t('common:error.update_resource', { resource: t('app:task') }));
    }
  };

  useEffect(() => {
    setSelectedType(taskTypes[taskTypes.findIndex((type) => type.value === currentType)]);
  }, [currentType]);

  return (
    <Command className={cn(className, 'relative w-48 p-0 rounded-lg')}>
      <CommandInput
        autoFocus={true}
        clearValue={setSearchValue}
        value={searchValue}
        onValueChange={(searchValue) => {
          // If the user taskTypes a number, select the Impact like useHotkeys
          if (inNumbersArray(3, searchValue)) {
            const searchNumber = Number.parseInt(searchValue) - 1;
            changeTaskType(taskTypes[searchNumber].value);
            setSelectedType(taskTypes[searchNumber]);
            dropdowner.remove();
            setSearchValue('');
            return;
          }
          setSearchValue(searchValue);
        }}
        wrapClassName="max-sm:hidden"
        className="leading-normal"
        placeholder={t('app:placeholder.type')}
      />
      {!isSearching && <Kbd value="T" className="max-sm:hidden absolute top-3 right-2.5" />}
      <CommandList>
        {!!searchValue.length && (
          <CommandEmpty className="flex justify-center text-muted items-center p-2 text-sm">
            {t('common:no_resource_found', { resource: t('app:type').toLowerCase() })}
          </CommandEmpty>
        )}
        <CommandGroup>
          {taskTypes.map((Type, index) => (
            <CommandItem
              key={Type.value}
              value={Type.value}
              onSelect={(value) => {
                const indexType = taskTypes.findIndex((type) => type.value === value);
                setSelectedType(taskTypes[indexType]);
                setSearchValue('');
                if (changeTaskType) changeTaskType(taskTypes[indexType].value);
                dropdowner.remove();
              }}
              className="group rounded-md flex gap-2 justify-between items-center w-full leading-normal"
            >
              <div>{Type.icon()}</div>
              <div className="grow">{Type.label}</div>
              <Check size={16} className={`text-success ${!selectedType || (selectedType.value !== Type.value && 'invisible')}`} />
              {!isSearching && <span className="max-sm:hidden text-xs opacity-50 mx-1">{index + 1}</span>}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  );
};

export default SelectTaskType;
