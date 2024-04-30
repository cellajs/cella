'use client';
import { Button } from '~/modules/ui/button';
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from '~/modules/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '~/modules/ui/popover';
import { useHotkeys } from '~/hooks/use-hot-keys';
import { cn } from '~/lib/utils';
import { HighIcon } from './impact-icons/high';
import { LowIcon } from './impact-icons/low';
import { MediumIcon } from './impact-icons/medium';
import { NoneIcon } from './impact-icons/none';
import { Kbd } from '../common/kbd';
import { Check } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFormContext } from 'react-hook-form';
import type { TaskImpact } from './task-form';

type ImpactOption = {
  value: (typeof impacts)[number]['value'];
  label: string;
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  icon: React.ElementType<any>;
};

const impacts = [
  { value: 'none', label: 'None', icon: NoneIcon },
  { value: 'low', label: 'Low', icon: LowIcon },
  { value: 'medium', label: 'Medium', icon: MediumIcon },
  { value: 'high', label: 'High', icon: HighIcon },
] as const;

interface SelectImpactProps {
  mode: 'edit' | 'create';
  viewValue?: TaskImpact;
  changeTaskImpact?: (value: TaskImpact) => void;
}

export const SelectImpact = ({ mode = 'create', viewValue, changeTaskImpact }: SelectImpactProps) => {
  const { t } = useTranslation();
  const formValue = useFormContext?.()?.getValues('impact');
  const [openPopover, setOpenPopover] = useState(false);
  const [selectedImpact, setSelectedImpact] = useState<ImpactOption | null>(viewValue ? impacts[viewValue] : impacts[formValue] || null);
  const [searchValue, setSearchValue] = useState('');
  const isSearching = searchValue.length > 0;

  // Open on key press
  useHotkeys([['p', () => setOpenPopover(true)]]);

  // Whenever the form value changes (also on reset), update the internal state
  useEffect(() => {
    if (mode === 'edit') return;
    setSelectedImpact(impacts[formValue] || null);
  }, [formValue]);

  return (
    <Popover open={openPopover} onOpenChange={setOpenPopover}>
      <PopoverTrigger asChild>
        <Button
          aria-label="Set impact"
          variant="ghost"
          size={mode === 'create' ? 'sm' : 'micro'}
          className={mode === 'create' ? 'w-full text-left font-light flex gap-2 justify-start border' : 'group-hover/task:opacity-100 opacity-70'}
        >
          {selectedImpact && selectedImpact.value !== 'none' ? (
            <>
              <selectedImpact.icon className={cn('size-4 fill-primary')} aria-hidden="true" />
              {mode === 'create' && selectedImpact.label}
            </>
          ) : (
            <>
              <NoneIcon className="size-4 fill-primary" aria-hidden="true" title="Set impact" />
              {mode === 'create' && 'Set impact'}
            </>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-48 p-0 rounded-lg" align="start" onCloseAutoFocus={(e) => e.preventDefault()} sideOffset={4}>
        <Command className="relative rounded-lg">
          <CommandInput
            clearValue={setSearchValue}
            value={searchValue}
            onValueChange={(searchValue) => {
              // If the user types a number, select the Impact like useHotkeys
              if ([0, 1, 2, 3, 4].includes(Number.parseInt(searchValue))) {
                setSelectedImpact(impacts[Number.parseInt(searchValue)]);
                setOpenPopover(false);
                setSearchValue('');
                return;
              }
              setSearchValue(searchValue);
            }}
            className="leading-normal"
            placeholder={t('common:placeholder.impact')}
          />
          {!isSearching && <Kbd value="P" className="absolute top-3 right-[10px]" />}
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
