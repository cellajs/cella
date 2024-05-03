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
  action: string;
  icon: LucideIcon;
};

const statuses = [
  { value: 0, action: 'iced', status: 'iced', icon: Snowflake },
  { value: 1, action: 'start', status: 'unstarted', icon: Dot },
  { value: 2, action: 'finish', status: 'started', icon: CircleDashed },
  { value: 3, action: 'deliver', status: 'finished', icon: Circle },
  { value: 4, action: 'review', status: 'delivered', icon: CircleDotDashed },
  { value: 5, action: 'accept', status: 'reviewed', icon: CircleDot },
  { value: 6, action: 'accepted', status: 'accepted', icon: CircleCheck },
] as const;

export type TaskStatus = (typeof statuses)[number]['value'];

interface SelectStatusProps {
  taskStatus: TaskStatus;
  changeTaskStatus: (newStatus: number) => void;
  mode?: 'create' | 'edit';
}

const SelectStatus = ({ taskStatus, changeTaskStatus, mode = 'edit' }: SelectStatusProps) => {
  const { t } = useTranslation();
  const [openPopover, setOpenPopover] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<Status>(statuses[taskStatus]);
  const isSearching = searchValue.length > 0;

  // Open on key press
  useHotkeys([['s', () => setOpenPopover(true)]]);

  const statusChange = (index: number) => {
    const newStatus = statuses[index];
    setSelectedStatus(newStatus);
    changeTaskStatus(index);
    if (mode === 'edit') toast.success(t('common:success.new_status', { status: t(newStatus.status).toLowerCase() }));
  };

  const nextStatusClick = () => {
    const statusIndex = selectedStatus.value;
    statusChange(statusIndex + 1);
  };

  const handleStatusChangeClick = (index: number) => {
    statusChange(index);
    setOpenPopover(false);
    setSearchValue('');
  };

  return (
    <Popover open={openPopover} onOpenChange={setOpenPopover}>
      {mode === 'edit' && (
        <Button
          variant="outlineGhost"
          size="micro"
          className="border-r-0 rounded-r-none"
          onClick={nextStatusClick}
          disabled={selectedStatus.value === 6}
        >
          {t(statuses[selectedStatus.value].action)}
        </Button>
      )}

      <PopoverTrigger asChild>
        <Button
          aria-label="Set status"
          variant={mode === 'edit' ? 'outlineGhost' : 'default'}
          size={mode === 'edit' ? 'micro' : 'xs'}
          className={mode === 'edit' ? 'rounded-none rounded-r -ml-2' : 'rounded-none rounded-r border-l border-l-background/25'}
        >
            <ChevronDown size={mode === 'edit' ? 12 : 16} className={`transition-transform ${openPopover ? 'rotate-180' : 'rotate-0'}`} />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-60 p-0 rounded-lg"
        align={mode === 'edit' ? 'end' : 'start'}
        onCloseAutoFocus={(e) => e.preventDefault()}
        sideOffset={4}
      >
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
            placeholder={mode === 'edit' ? t('common:placeholder.set_status') : t('common:placeholder.create_with_status')}
          />
          {!isSearching && <Kbd value="S" className="absolute top-3 right-[10px]" />}

          <CommandGroup>
            <CommandList>
              {statuses.map((status, index) => {
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
