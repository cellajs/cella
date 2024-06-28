'use client';
import { Check } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
// import { useHotkeys } from '~/hooks/use-hot-keys';
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from '~/modules/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '~/modules/ui/popover';
import { Kbd } from '../../../common/kbd';
import type { TaskImpact } from '../create-task-form';
import { HighIcon } from './impact-icons/high';
import { LowIcon } from './impact-icons/low';
import { MediumIcon } from './impact-icons/medium';
import { NoneIcon } from './impact-icons/none';

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
  children: React.ReactNode;
  changeTaskImpact: (value: TaskImpact) => void;
  triggerWidth?: number;
}

export const SelectImpact = ({ value, children, changeTaskImpact, triggerWidth = 192 }: SelectImpactProps) => {
  const { t } = useTranslation();
  const [openPopover, setOpenPopover] = useState(false);
  const [selectedImpact, setSelectedImpact] = useState<ImpactOption | null>(value ? impacts[value] : null);
  const [searchValue, setSearchValue] = useState('');
  const isSearching = searchValue.length > 0;

  // Open on key press
  // useHotkeys([
  //   [
  //     'i',
  //     () => {
  //       if (focusedTaskId === task.id) setOpenPopover(true);
  //     },
  //   ],
  // ]);

  return (
    <Popover open={openPopover} onOpenChange={setOpenPopover}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        style={{ width: `${triggerWidth}px` }}
        className="p-0 rounded-lg"
        align="start"
        onCloseAutoFocus={(e) => e.preventDefault()}
        sideOffset={4}
      >
        <Command className="relative rounded-lg">
          <CommandInput
            clearValue={setSearchValue}
            value={searchValue}
            onValueChange={(searchValue) => {
              // If the user types a number, select the Impact like useHotkeys
              if ([0, 1, 2, 3].includes(Number.parseInt(searchValue))) {
                setSelectedImpact(impacts[Number.parseInt(searchValue)]);
                changeTaskImpact(Number.parseInt(searchValue) as TaskImpact);
                setOpenPopover(false);
                setSearchValue('');
                return;
              }
              setSearchValue(searchValue);
            }}
            className="leading-normal"
            placeholder={t('common:placeholder.impact')}
          />
          {!isSearching && <Kbd value="I" className="absolute top-3 right-2.5" />}
          <CommandList>
            <CommandGroup>
              {impacts.map((Impact, index) => (
                <CommandItem
                  key={Impact.value}
                  value={Impact.value}
                  onSelect={(value) => {
                    const currentImpact = impacts.find((p) => p.value === value);
                    setSelectedImpact(currentImpact || null);
                    setOpenPopover(false);
                    setSearchValue('');
                    if (changeTaskImpact) changeTaskImpact(impacts.findIndex((impact) => impact.value === value) as TaskImpact);
                  }}
                  className="group rounded-md flex justify-between items-center w-full leading-normal"
                >
                  <div className="flex items-center">
                    <Impact.icon title={Impact.label} className="mr-2 size-4 fill-muted-foreground group-hover:fill-primary" />
                    <span>{Impact.label}</span>
                  </div>
                  <div className="flex items-center">
                    {selectedImpact?.value === Impact.value && <Check size={16} className="text-success" />}
                    {!isSearching && <span className="max-xs:hidden text-xs ml-3 opacity-50 mr-1">{index}</span>}
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
