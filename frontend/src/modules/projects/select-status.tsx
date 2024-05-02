import { useState } from 'react';
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from '~/modules/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '~/modules/ui/popover';
import { Button } from '../ui/button';
import { ChevronDown, Check, Snowflake, CircleDashed, Circle, CircleDot, CircleDotDashed, CircleCheck, type LucideIcon, Dot } from 'lucide-react';
import { Kbd } from '../common/kbd';
import { useTranslation } from 'react-i18next';
import { useHotkeys } from '~/hooks/use-hot-keys';
import { toast } from 'sonner';

type Status = {
  value: (typeof statuses)[number]['value'];
  status: string;
  button: string;
  icon: LucideIcon;
};

const statuses = [
  { value: 0, button: 'Iced', status: 'Iced', icon: Snowflake },
  { value: 1, button: 'Start', status: 'Unstarted', icon: Dot },
  { value: 2, button: 'Finish', status: 'Started', icon: CircleDashed },
  { value: 3, button: 'Deliver', status: 'Finished', icon: Circle },
  { value: 4, button: 'Review', status: 'Delivered', icon: CircleDotDashed },
  { value: 5, button: 'Accept', status: 'Reviewed', icon: CircleDot },
  { value: 6, button: 'Accepted', status: 'Accepted', icon: CircleCheck },
] as const;

export type TaskStatus = (typeof statuses)[number]['value'];

interface SelectStatusProps {
  taskStatus: TaskStatus;
  changeTaskStatus: (newStatus: number) => void;
}

const SelectStatus = ({ taskStatus, changeTaskStatus }: SelectStatusProps) => {
  const { t } = useTranslation();
  const [openPopover, setOpenPopover] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<Status>(statuses[taskStatus]);
  const isSearching = searchValue.length > 0;

  // Open on key press
  useHotkeys([['s', () => setOpenPopover(true)]]);

  const nextStatusClick = () => {
    const statusIndex = selectedStatus.value;
    setSelectedStatus(statuses[statusIndex + 1]);
    changeTaskStatus(statusIndex + 1);
    toast.success(t('common:success.task_updated', { name: statuses[statusIndex + 1].status }));
  };

  const handleStatusChange = (index: number) => {
    setSelectedStatus(statuses[index]);
    setOpenPopover(false);
    setSearchValue('');
    changeTaskStatus(index);
    toast.success(t('common:success.task_updated', { name: statuses[index].status }));
  };

  return (
    <Popover open={openPopover} onOpenChange={setOpenPopover}>
      <Button
        variant="outlineGhost"
        size="micro"
        className="border-r-0 rounded-r-none"
        onClick={nextStatusClick}
        disabled={selectedStatus.value === 6}
      >
        {statuses[selectedStatus.value].button}
      </Button>

      <PopoverTrigger asChild>
        <Button aria-label="Set status" variant="outlineGhost" size="micro" className="rounded-none rounded-r -ml-2">
          <ChevronDown size={12} className={`transition-transform ${openPopover ? 'rotate-180' : 'rotate-0'}`} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-0 rounded-lg" align="end" onCloseAutoFocus={(e) => e.preventDefault()} sideOffset={4}>
        <Command className="relative rounded-lg">
          <CommandInput
            value={searchValue}
            clearValue={setSearchValue}
            onValueChange={(searchValue) => {
              // If the user types a number, select status like useHotkeys
              if ([0, 1, 2, 3, 4, 5, 6].includes(Number.parseInt(searchValue))) {
                handleStatusChange(Number.parseInt(searchValue));
                return;
              }
              setSearchValue(searchValue);
            }}
            placeholder={t('common:placeholder.set_status')}
          />
          {!isSearching && <Kbd value="S" className="absolute top-3 right-[10px]" />}
          <CommandList>
            <CommandGroup>
              {statuses.map((status, index) => (
                <CommandItem
                  key={status.value}
                  value={status.status}
                  onSelect={() => {
                    handleStatusChange(index);
                  }}
                  className="group rounded-md flex justify-between items-center w-full leading-normal"
                >
                  <div className="flex items-center">
                    <status.icon size={16} className="mr-2 size-4 " />
                    <span>{status.status}</span>
                  </div>
                  <div className="flex items-center">
                    {selectedStatus.value === status.value && <Check size={16} className="text-success" />}
                    {!isSearching && <span className="max-xs:hidden text-xs opacity-50 ml-3 mr-1">{index}</span>}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default SelectStatus;
