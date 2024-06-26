import { cva } from 'class-variance-authority';
import { Check, type LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
// import { useHotkeys } from '~/hooks/use-hot-keys';
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from '~/modules/ui/command';
import { Kbd } from '~/modules/common/kbd';
import { dropDown } from '~/modules/common/dropdowner/state';
import { taskStatuses } from '../../tasks-table/status';

type Status = {
  value: (typeof taskStatuses)[number]['value'];
  status: string;
  action: string;
  icon: LucideIcon;
};

export type TaskStatus = (typeof taskStatuses)[number]['value'];

interface SelectStatusProps {
  taskStatus: TaskStatus;
  changeTaskStatus: (newStatus: number) => void;
  inputPlaceholder: string;
}

export const statusVariants = cva('', {
  variants: {
    status: {
      0: 'bg-background/50 border-sky-500/40 hover:bg-sky-500/10 hover:border-sky-500/60 text-sky-600',
      1: 'border-slate-300/40 hover:bg-slate-300/10 hover:border-slate-300/60',
      2: 'bg-background/50 border-slate-500/40 hover:bg-slate-500/10 hover:border-slate-500/60',
      3: 'bg-background/50 border-lime-500/40 hover:bg-lime-500/10 hover:border-lime-500/60',
      4: 'bg-background/50 border-yellow-500/40 hover:bg-yellow-500/10 hover:border-yellow-500/60',
      5: 'bg-background/50 border-orange-500/40 hover:bg-orange-500/10 hover:border-orange-500/60',
      6: 'bg-background/50 border-green-500/40 hover:bg-green-500/10 hover:border-green-500/60 text-green-600',
    },
  },
});

const SelectStatus = ({ taskStatus, inputPlaceholder, changeTaskStatus }: SelectStatusProps) => {
  const { t } = useTranslation();
  const [searchValue, setSearchValue] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<Status>(taskStatuses[taskStatus]);

  const isSearching = searchValue.length > 0;
  // Open on key press
  // useHotkeys([
  //   [
  //     's',
  //     () => {
  //       if (focusedTaskId === task.id) setOpenPopover(true);
  //     },
  //   ],
  // ]);

  const statusChange = (index: number) => {
    const newStatus = taskStatuses[index];
    setSelectedStatus(newStatus);
    changeTaskStatus(index);
  };

  const handleStatusChangeClick = (index: number) => {
    statusChange(index);
    dropDown.remove();
    setSearchValue('');
  };

  useEffect(() => {
    setSelectedStatus(taskStatuses[taskStatus]);
  }, [taskStatus]);

  return (
    <Command className="relative rounded-lg w-60">
      <CommandInput
        value={searchValue}
        clearValue={setSearchValue}
        onValueChange={(searchValue) => {
          // If the user types a number, select status like useHotkeys
          if ([0, 1, 2, 3, 4, 5, 6].includes(Number.parseInt(searchValue))) {
            handleStatusChangeClick(Number.parseInt(searchValue));
            return;
          }
          setSearchValue(searchValue);
        }}
        placeholder={inputPlaceholder}
      />
      {!isSearching && <Kbd value="S" className="absolute top-3 right-2.5" />}

      <CommandGroup>
        <CommandList>
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
                  <status.icon size={16} className="mr-2 size-4 " />
                  <span>{t(status.status)}</span>
                </div>
                <div className="flex items-center">
                  {selectedStatus.value === status.value && <Check size={16} className="text-success" />}
                  {!isSearching && <span className="max-xs:hidden text-xs opacity-50 ml-3 mr-1">{index}</span>}
                </div>
              </CommandItem>
            );
          })}
        </CommandList>
      </CommandGroup>
    </Command>
  );
};

export default SelectStatus;
