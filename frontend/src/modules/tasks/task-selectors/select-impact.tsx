import { useLocation } from '@tanstack/react-router';
import { Check } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { updateTask } from '~/api/tasks';
import { dispatchCustomEvent } from '~/lib/custom-events';
import { dropdowner } from '~/modules/common/dropdowner/state';
import { Kbd } from '~/modules/common/kbd';
import type { TaskImpact } from '~/modules/tasks/create-task-form';
import { inNumbersArray } from '~/modules/tasks/helpers';
import { HighIcon } from '~/modules/tasks/task-selectors/impact-icons/high';
import { LowIcon } from '~/modules/tasks/task-selectors/impact-icons/low';
import { MediumIcon } from '~/modules/tasks/task-selectors/impact-icons/medium';
import { NoneIcon } from '~/modules/tasks/task-selectors/impact-icons/none';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '~/modules/ui/command';
import { useWorkspaceStore } from '~/store/workspace';

type ImpactOption = {
  value: (typeof impacts)[number]['value'];
  label: string;
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  icon: React.ElementType<any>;
};

export const impacts = [
  { value: 'none', label: 'None', icon: NoneIcon },
  { value: 'low', label: 'Low', icon: LowIcon },
  { value: 'medium', label: 'Medium', icon: MediumIcon },
  { value: 'high', label: 'High', icon: HighIcon },
] as const;

interface SelectImpactProps {
  value: TaskImpact;
  triggerWidth?: number;
  creationValueChange?: (newValue: TaskImpact) => void;
}

const SelectImpact = ({ value, triggerWidth = 192, creationValueChange }: SelectImpactProps) => {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { focusedTaskId } = useWorkspaceStore();
  const [selectedImpact, setSelectedImpact] = useState<ImpactOption | null>(value !== null ? impacts[value] : null);
  const [searchValue, setSearchValue] = useState('');
  const isSearching = searchValue.length > 0;

  const changeTaskImpact = async (newImpact: TaskImpact) => {
    try {
      if (creationValueChange) return creationValueChange(newImpact);
      if (!focusedTaskId) return;
      const updatedTask = await updateTask(focusedTaskId, 'impact', newImpact);
      const eventName = pathname.includes('/board') ? 'taskOperation' : 'taskTableOperation';
      dispatchCustomEvent(eventName, { array: [updatedTask], action: 'update', projectId: updatedTask.projectId });
    } catch (err) {
      toast.error(t('common:error.update_resource', { resource: t('app:task') }));
    }
  };

  return (
    <Command className="relative rounded-lg" style={{ width: `${triggerWidth}px` }}>
      <CommandInput
        autoFocus={true}
        clearValue={setSearchValue}
        value={searchValue}
        onValueChange={(searchValue) => {
          // If the user types a number, select the Impact like useHotkeys
          if (inNumbersArray(4, searchValue)) {
            changeTaskImpact((Number.parseInt(searchValue) - 1) as TaskImpact);
            dropdowner.remove();
            setSearchValue('');
            return;
          }
          setSearchValue(searchValue);
        }}
        wrapClassName="max-sm:hidden"
        className="leading-normal"
        placeholder={t('app:placeholder.impact')}
      />
      {!isSearching && <Kbd value="I" className="max-sm:hidden absolute top-3 right-2.5" />}
      {isSearching && (
        <CommandEmpty className="flex justify-center items-center p-2 text-sm">
          {t('common:no_resource_found', { resource: t('app:impact').toLowerCase() })}
        </CommandEmpty>
      )}
      <CommandList>
        <CommandGroup>
          {impacts.map((Impact, index) => (
            <CommandItem
              key={Impact.value}
              value={Impact.value}
              onSelect={(value) => {
                const currentImpact = impacts.find((p) => p.value === value);
                setSelectedImpact(currentImpact || null);
                setSearchValue('');
                if (changeTaskImpact) changeTaskImpact(impacts.findIndex((impact) => impact.value === value) as TaskImpact);
                dropdowner.remove();
              }}
              className="group rounded-md flex justify-between items-center w-full leading-normal"
            >
              <div className="flex items-center">
                <Impact.icon className={`mr-2 size-4 fill-current ${selectedImpact?.value === Impact.value ? 'fill-primary' : ''} `} />
                <span>{Impact.label}</span>
              </div>
              <div className="flex items-center">
                <Check size={16} className={`text-success ${!selectedImpact || (selectedImpact.value !== Impact.value && 'invisible')}`} />
                {!isSearching && <span className="max-sm:hidden text-xs ml-3 opacity-50 mr-1">{index + 1}</span>}
              </div>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  );
};

export default SelectImpact;
