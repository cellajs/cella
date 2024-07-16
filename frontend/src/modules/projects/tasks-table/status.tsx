import { Check, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Kbd } from '~/modules/common/kbd.tsx';
import { Button } from '~/modules/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '~/modules/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '~/modules/ui/popover';
import { inNumbersArray } from '../task/task-selectors/helpers';
import { taskStatuses } from '../task/task-selectors/select-status';

interface Props {
  selectedStatuses: number[];
  setSelectedStatuses: (statuses: number[]) => void;
}

const SelectStatus = ({ selectedStatuses, setSelectedStatuses }: Props) => {
  const { t } = useTranslation();

  const [openPopover, setOpenPopover] = useState(false);
  const [searchValue, setSearchValue] = useState('');

  const handleSelectClick = (value: number) => {
    const existingStatus = selectedStatuses.find((status) => status === value);
    if (typeof existingStatus !== 'undefined') {
      const updatedList = selectedStatuses.filter((status) => status !== value);
      setSelectedStatuses(updatedList);
      return;
    }
    const newStatus = taskStatuses.find((status) => status.value === value);
    if (newStatus) {
      const updatedList = [...selectedStatuses, newStatus.value];
      setSelectedStatuses(updatedList);
      return;
    }
  };

  return (
    <Popover open={openPopover} onOpenChange={setOpenPopover}>
      <PopoverTrigger asChild>
        <Button
          aria-label="Select Status"
          variant="ghost"
          size="sm"
          className="flex justify-start gap-2 group-hover/task:opacity-100 group-[.is-focused]/task:opacity-100 opacity-70"
        >
          {selectedStatuses.length ? (
            <div className="flex items-center gap-1">
              {selectedStatuses.sort().map((status) => {
                const currentStatus = taskStatuses.find((s) => s.value === status);
                if (!currentStatus) return null;
                if (selectedStatuses.length > 3) return <currentStatus.icon />;
                return (
                  <div className="flex items-center gap-1" key={status}>
                    <currentStatus.icon />
                    <span>{t(currentStatus.status)}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center gap-1">
              {t('common:status')}
              <ChevronDown className="h-4 w-4 opacity-50" />
            </div>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="p-0 rounded-lg" align="end" onCloseAutoFocus={(e) => e.preventDefault()} sideOffset={4}>
        <Command className="relative rounded-lg">
          <CommandInput
            value={searchValue}
            onValueChange={(searchValue) => {
              // If the user types a number, select status like useHotkeys
              if (inNumbersArray(7, searchValue)) return handleSelectClick(Number.parseInt(searchValue) - 1);
              setSearchValue(searchValue);
            }}
            clearValue={setSearchValue}
            className="leading-normal"
            placeholder={t('common:placeholder.select_status')}
          />
          {!searchValue.length && <Kbd value="S" className="absolute top-3 right-2.5" />}
          <CommandList>
            {!!searchValue.length && (
              <CommandEmpty className="flex justify-center items-center p-2 text-sm">
                {t('common:no_resource_found', { resource: t('common:status').toLowerCase() })}
              </CommandEmpty>
            )}
            {taskStatuses && (
              <CommandGroup>
                {taskStatuses.map((status, index) => (
                  <CommandItem
                    key={status.value}
                    value={status.status}
                    onSelect={() => {
                      handleSelectClick(index);
                    }}
                    className="group rounded-md flex justify-between items-center w-full leading-normal"
                  >
                    <div className="flex items-center">
                      <status.icon className="mr-2 size-4" />
                      <span>{t(status.status)}</span>
                    </div>
                    <div className="flex items-center">
                      {selectedStatuses.some((s) => s === status.value) && <Check size={16} className="text-success" />}
                      {!searchValue.length && <span className="max-xs:hidden text-xs opacity-50 ml-3 mr-1">{index + 1}</span>}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default SelectStatus;
