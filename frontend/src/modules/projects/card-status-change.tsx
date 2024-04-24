import { useState } from 'react';
import { Command, CommandGroup, CommandItem, CommandList } from '~/modules/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '~/modules/ui/popover';
import { Tooltip, TooltipTrigger } from '~/modules/ui/tooltip';
import { Button } from '../ui/button';
import { ChevronRight, ChevronDown } from 'lucide-react';

type Status = {
  value: (typeof statuses)[number]['value'];
  status: string;
  button: string;
};

const statuses = [
  { value: 0, button: 'Ice', status: 'Iced' },
  { value: 1, button: 'Unstart', status: 'Unstarted' },
  { value: 2, button: 'Start', status: 'Started' },
  { value: 3, button: 'Finish', status: 'Finished' },
  { value: 4, button: 'Deliver', status: 'Delivered' },
  { value: 5, button: 'Review', status: 'Reviewed' },
  { value: 6, button: 'Accept', status: 'Accepted' },
] as const;

interface SelectStatusButtons {
  taskStatus: (typeof statuses)[number]['value'];
  changeTaskStatus: (newStatus: number) => void;
}

const SelectStatusButtons = ({ taskStatus, changeTaskStatus }: SelectStatusButtons) => {
  const [openPopover, setOpenPopover] = useState(false);
  const [openTooltip, setOpenTooltip] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<Status>(statuses[taskStatus]);

  const nextStatusClick = () => {
    const statusIndex = selectedStatus.value;
    if (statusIndex > 5) return;
    setSelectedStatus(statuses[statusIndex + 1]);
    changeTaskStatus(statusIndex + 1);
  };

  return (
    <Popover open={openPopover} onOpenChange={setOpenPopover}>
      <Tooltip delayDuration={500} open={openTooltip} onOpenChange={setOpenTooltip}>
        {selectedStatus.value < 6 && (
          <Button variant="plain" size="sm" className="rounded text-[12px] p-1 h-6" onClick={nextStatusClick}>
            {selectedStatus.value < 6 && statuses[selectedStatus.value + 1].button}
          </Button>
        )}
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button aria-label="Set status" variant="ghost" size="sm" className="rounded text-[12px] p-1 h-6 gap-0.5">
              {openPopover ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
      </Tooltip>
      <PopoverContent className="w-[105px] p-0 rounded-lg" align="start" onCloseAutoFocus={(e) => e.preventDefault()} sideOffset={6}>
        <Command className="relative rounded-lg">
          <CommandList>
            <CommandGroup>
              {statuses
                .filter((el) => el.value > 0)
                .map((status, index) => (
                  <CommandItem
                    key={status.value}
                    value={status.status}
                    onSelect={() => {
                      setSelectedStatus(statuses[index + 1]);
                      setOpenTooltip(false);
                      setOpenPopover(false);
                      changeTaskStatus(index);
                    }}
                    className="rounded-md justify-center text-[0.8125rem] leading-normal text-primary"
                  >
                    <span>{status.status}</span>
                  </CommandItem>
                ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default SelectStatusButtons;
