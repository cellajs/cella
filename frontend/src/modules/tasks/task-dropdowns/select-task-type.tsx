import { Bolt, Bug, Check, Star } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { dropdowner } from '~/modules/common/dropdowner/state';
import { Kbd } from '~/modules/common/kbd';
import { useTaskUpdateMutation } from '~/modules/common/query-client-provider/tasks';
import { inNumbersArray } from '~/modules/tasks/helpers';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '~/modules/ui/command';
import { useWorkspaceQuery } from '~/modules/workspaces/helpers/use-workspace';
import type { Task } from '~/types/app';
import { cn } from '~/utils/cn';
import { TaskType } from '#/modules/tasks/schema';

type Type = {
  value: (typeof taskTypes)[number]['value'];
  label: string;
  icon: () => JSX.Element;
};

export const taskTypes = [
  { value: TaskType.feature, type: 'feature', label: 'Feature', icon: () => <Star size={16} className="fill-amber-400 text-amber-500" /> },
  { value: TaskType.chore, type: 'chore', label: 'Chore', icon: () => <Bolt size={16} className="fill-slate-400 text-slate-500" /> },
  { value: TaskType.bug, type: 'bug', label: 'Bug', icon: () => <Bug size={16} className="fill-red-400 text-red-500" /> },
] as const;

export interface SelectTaskTypeProps {
  task: Task;
  className?: string;
}

const SelectTaskType = ({ task, className = '' }: SelectTaskTypeProps) => {
  const { t } = useTranslation();

  const {
    data: { workspace },
  } = useWorkspaceQuery();
  const [selectedType, setSelectedType] = useState<Type | undefined>(taskTypes[taskTypes.findIndex((type) => type.value === task.type)]);
  const [searchValue, setSearchValue] = useState('');
  const isSearching = searchValue.length > 0;
  const taskMutation = useTaskUpdateMutation();

  const changeTaskType = async (newType: TaskType) => {
    try {
      await taskMutation.mutateAsync({
        id: task.id,
        orgIdOrSlug: workspace.organizationId,
        key: 'type',
        data: newType,
        projectId: task.projectId,
      });
    } catch (err) {
      toast.error(t('common:error.update_resource', { resource: t('app:task') }));
    }
  };

  useEffect(() => {
    setSelectedType(taskTypes[taskTypes.findIndex((type) => type.value === task.type)]);
  }, [task.type]);

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
              value={Type.type}
              onSelect={(value) => {
                const indexType = taskTypes.findIndex((type) => type.type === value);
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
