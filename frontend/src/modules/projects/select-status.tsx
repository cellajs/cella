import { useState } from 'react';
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from '~/modules/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '~/modules/ui/popover';
import { Tooltip, TooltipTrigger } from '~/modules/ui/tooltip';
import { Button } from '../ui/button';
import { ChevronDown, Check } from 'lucide-react';
import { Kbd } from '../common/kbd';

type Status = {
  value: (typeof statuses)[number]['value'];
  status: string;
  button: string;
};

const statuses = [
  { value: 0, button: 'Iced', status: 'Iced' },
  { value: 1, button: 'Start', status: 'Unstarted' },
  { value: 2, button: 'Finish', status: 'Started' },
  { value: 3, button: 'Deliver', status: 'Finished' },
  { value: 4, button: 'Review', status: 'Delivered' },
  { value: 5, button: 'Accept', status: 'Reviewed' },
  { value: 6, button: 'Accepted', status: 'Accepted' },
] as const;

interface SelectStatusProps {
  taskStatus: (typeof statuses)[number]['value'];
  changeTaskStatus: (newStatus: number) => void;
}

const SelectStatus = ({ taskStatus, changeTaskStatus }: SelectStatusProps) => {
  const [openPopover, setOpenPopover] = useState(false);
  const [openTooltip, setOpenTooltip] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const isSearching = searchValue.length > 0;
  const [selectedStatus, setSelectedStatus] = useState<Status>(statuses[taskStatus]);

  const nextStatusClick = () => {
    const statusIndex = selectedStatus.value;
    setSelectedStatus(statuses[statusIndex + 1]);
    changeTaskStatus(statusIndex + 1);
  };

  return (
    <Popover open={openPopover} onOpenChange={setOpenPopover}>
      <Tooltip delayDuration={500} open={openTooltip} onOpenChange={setOpenTooltip}>
        <Button variant="plain" size="micro" className="border-r-0 rounded-r-none" onClick={nextStatusClick} disabled={selectedStatus.value === 6}>
          {statuses[selectedStatus.value].button}
        </Button>

        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button aria-label="Set status" variant="plain" size="micro" className="rounded-none rounded-r -ml-2">
              <ChevronDown size={12} className={`transition-transform ${openPopover ? 'rotate-180' : 'rotate-0'}`} />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
      </Tooltip>
      <PopoverContent className="w-[205px] p-0 rounded-lg" align="end" onCloseAutoFocus={(e) => e.preventDefault()} sideOffset={6}>
        <Command className="relative rounded-lg">
          <CommandInput
            value={searchValue}
            clearValue={setSearchValue}
            onValueChange={(searchValue) => {
              // If the user types a number, select status like useHotkeys
              if ([0, 1, 2, 3, 4, 5, 6].includes(Number.parseInt(searchValue))) {
                setSelectedStatus(statuses[Number.parseInt(searchValue)]);
                setOpenTooltip(false);
                setOpenPopover(false);
                setSearchValue('');
                return;
              }
              setSearchValue(searchValue);
            }}
            placeholder="Set status ..."
          />
          {!isSearching && <Kbd value="S" className="absolute top-3 right-[10px]" />}
          <CommandList>
            <CommandGroup>
              {statuses.map((status, index) => (
                <CommandItem
                  key={status.value}
                  value={status.status}
                  onSelect={() => {
                    setSelectedStatus(statuses[index]);
                    setOpenTooltip(false);
                    setOpenPopover(false);
                    setSearchValue('');
                    changeTaskStatus(index);
                  }}
                  className="group rounded-md flex justify-between items-center w-full leading-normal"
                >
                  <div className="flex items-center">
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
