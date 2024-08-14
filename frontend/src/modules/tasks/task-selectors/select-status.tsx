import { cva } from 'class-variance-authority';
import { CommandEmpty } from 'cmdk';
import { Check } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { dropdowner } from '~/modules/common/dropdowner/state';
import { Kbd } from '~/modules/common/kbd';
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from '~/modules/ui/command';
import { inNumbersArray } from './helpers';
import { AcceptedIcon } from './status-icons/accepted';
import { DeliveredIcon } from './status-icons/delivered';
import { FinishedIcon } from './status-icons/finished';
import { IcedIcon } from './status-icons/iced';
import { ReviewedIcon } from './status-icons/reviewed';
import { StartedIcon } from './status-icons/started';
import { UnstartedIcon } from './status-icons/unstarted';
import { useWorkspaceStore } from '~/store/workspace';
import { dispatchCustomEvent } from '~/lib/custom-events';
import { updateTask } from '~/api/tasks';
import { getTaskOrder } from '~/modules/tasks/helpers';
import { useLocation } from '@tanstack/react-router';

export const taskStatuses = [
  { value: 0, action: 'iced', status: 'iced', icon: IcedIcon },
  { value: 1, action: 'start', status: 'unstarted', icon: UnstartedIcon },
  { value: 2, action: 'finish', status: 'started', icon: StartedIcon },
  { value: 3, action: 'deliver', status: 'finished', icon: FinishedIcon },
  { value: 4, action: 'review', status: 'delivered', icon: DeliveredIcon },
  { value: 5, action: 'accept', status: 'reviewed', icon: ReviewedIcon },
  { value: 6, action: 'accepted', status: 'accepted', icon: AcceptedIcon },
] as const;

type Status = {
  value: (typeof taskStatuses)[number]['value'];
  status: string;
  action: string;
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  icon: React.ElementType<any>;
};

export type TaskStatus = (typeof taskStatuses)[number]['value'];

export const statusTextColors = {
  0: 'text-sky-500',
  1: 'text-slate-500',
  2: 'text-regular',
  3: 'text-lime-500',
  4: 'text-yellow-500',
  5: 'text-orange-500',
  6: 'text-green-500',
};

export const statusFillColors = {
  0: 'fill-sky-500',
  1: 'fill-slate-500',
  2: 'fill-regular',
  3: 'fill-lime-500',
  4: 'fill-yellow-500',
  5: 'fill-orange-500',
  6: 'fill-green-500',
};

export const statusVariants = cva('', {
  variants: {
    status: {
      0: 'bg-background/50 border-sky-500/40 hover:bg-sky-500/10 hover:border-sky-500/60 text-sky-600',
      1: '',
      2: 'bg-background/50 border-slate-500/40 hover:bg-slate-500/10 hover:border-slate-500/60',
      3: 'bg-background/50 border-lime-500/40 hover:bg-lime-500/10 hover:border-lime-500/60',
      4: 'bg-background/50 border-yellow-500/40 hover:bg-yellow-500/10 hover:border-yellow-500/60',
      5: 'bg-background/50 border-orange-500/40 hover:bg-orange-500/10 hover:border-orange-500/60',
      6: 'bg-background/50 border-green-500/40 hover:bg-green-500/10 hover:border-green-500/60 text-green-600',
    },
  },
});

const SelectStatus = ({ taskStatus, creationValueChange }: { taskStatus: TaskStatus; creationValueChange?: (newValue: number) => void }) => {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { focusedTaskId } = useWorkspaceStore();
  const [searchValue, setSearchValue] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<Status>(taskStatuses[taskStatus]);

  const changeTaskStatus = async (newStatus: number) => {
    if (creationValueChange) creationValueChange(newStatus);
    if (!focusedTaskId) return;
    //TODO rework logic
    const newOrder = getTaskOrder(focusedTaskId, newStatus, []);
    const updatedTask = await updateTask(focusedTaskId, 'status', newStatus, newOrder);
    if (pathname.includes('/board')) dispatchCustomEvent('taskCRUD', { array: [updatedTask], action: 'update' });
    dispatchCustomEvent('taskTableCRUD', { array: [updatedTask], action: 'update' });
  };

  const isSearching = searchValue.length > 0;

  const statusChange = (index: number) => {
    const newStatus = taskStatuses[index];
    setSelectedStatus(newStatus);
    changeTaskStatus(index);
  };

  const handleStatusChangeClick = (index: number) => {
    statusChange(index);
    dropdowner.remove();
    setSearchValue('');
  };

  useEffect(() => {
    setSelectedStatus(taskStatuses[taskStatus]);
  }, [taskStatus]);

  return (
    <Command className="relative rounded-lg w-60">
      <CommandInput
        autoFocus={true}
        value={searchValue}
        clearValue={setSearchValue}
        wrapClassName="max-sm:hidden"
        onValueChange={(searchValue) => {
          // If the user types a number, select status like useHotkeys
          if (inNumbersArray(7, searchValue)) return handleStatusChangeClick(Number.parseInt(searchValue) - 1);
          setSearchValue(searchValue);
        }}
        placeholder={t('common:placeholder.set_status')}
      />
      {!isSearching && <Kbd value="S" className="max-sm:hidden absolute top-3 right-2.5" />}

      <CommandList>
        {!!searchValue.length && (
          <CommandEmpty className="flex justify-center items-center p-2 text-sm">
            {t('common:no_resource_found', { resource: t('common:status').toLowerCase() })}
          </CommandEmpty>
        )}
        <CommandGroup>
          {taskStatuses.map((status, index) => {
            return (
              <CommandItem
                key={status.value}
                value={status.status}
                onSelect={() => {
                  handleStatusChangeClick(index);
                }}
                className="group rounded-md flex justify-between items-center w-full leading-normal"
              >
                <div className="flex items-center">
                  <status.icon className={`size-4 mr-2 fill-current ${statusFillColors[status.value] || ''} `} />
                  <span className={`${selectedStatus.value === status.value ? statusTextColors[status.value] : ''} `}>{t(status.status)}</span>
                </div>
                <div className="flex items-center">
                  {selectedStatus.value === status.value && <Check size={16} className="text-success" />}
                  {!isSearching && <span className="max-sm:hidden text-xs opacity-50 ml-3 mr-1">{index + 1}</span>}
                </div>
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </Command>
  );
};

export default SelectStatus;
