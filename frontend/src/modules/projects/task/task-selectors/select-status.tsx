import { cva } from 'class-variance-authority';
import { Check, Circle, CircleCheck, CircleDashed, CircleDot, CircleDotDashed, Dot, type LucideIcon, Snowflake } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
// import { useHotkeys } from '~/hooks/use-hot-keys';
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from '~/modules/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '~/modules/ui/popover';
import { Kbd } from '../../../common/kbd';

type Status = {
  value: (typeof taskStatuses)[number]['value'];
  status: string;
  action: string;
  icon: LucideIcon;
};

export const taskStatuses = [
  { value: 0, action: 'iced', status: 'iced', icon: Snowflake },
  { value: 1, action: 'start', status: 'unstarted', icon: Dot },
  { value: 2, action: 'finish', status: 'started', icon: CircleDashed },
  { value: 3, action: 'deliver', status: 'finished', icon: Circle },
  { value: 4, action: 'review', status: 'delivered', icon: CircleDotDashed },
  { value: 5, action: 'accept', status: 'reviewed', icon: CircleDot },
  { value: 6, action: 'accepted', status: 'accepted', icon: CircleCheck },
] as const;

export type TaskStatus = (typeof taskStatuses)[number]['value'];

interface SelectStatusProps {
  taskStatus: TaskStatus;
  trigger: React.ReactNode;
  changeTaskStatus: (newStatus: number) => void;
  inputPlaceholder: string;
  nextButton?: React.ReactNode;
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

const SelectStatus = ({ taskStatus, inputPlaceholder, trigger, changeTaskStatus, nextButton }: SelectStatusProps) => {
  const { t } = useTranslation();
  const [openPopover, setOpenPopover] = useState(false);
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
    setOpenPopover(false);
    setSearchValue('');
  };

  useEffect(() => {
    setSelectedStatus(taskStatuses[taskStatus]);
  }, [taskStatus]);

  return (
    <Popover open={openPopover} onOpenChange={setOpenPopover}>
      <div className="flex gap-2 [&:not(.absolute)]:active:translate-y-[.07rem]">
        {nextButton && nextButton}
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      </div>

      <PopoverContent className="w-60 p-0 rounded-lg" align="end" onCloseAutoFocus={(e) => e.preventDefault()} sideOffset={4}>
        <Command className="relative rounded-lg">
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
      </PopoverContent>
    </Popover>
  );
};

export default SelectStatus;
