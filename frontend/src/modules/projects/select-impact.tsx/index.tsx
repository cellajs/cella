'use client';
import { Button } from '~/modules/ui/button';
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from '~/modules/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '~/modules/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '~/modules/ui/tooltip';
import { useHotkeys } from '~/hooks/use-hot-keys';
import { cn } from '~/lib/utils';
import * as React from 'react';
import { HighIcon } from './icons/high';
import { LowIcon } from './icons/low';
import { MediumIcon } from './icons/medium';
import { NoneIcon } from './icons/none';
import { Kbd } from '../../common/kbd';
import { Check } from 'lucide-react';

type Impact = {
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

export const SelectImpact = ({ mode = 'create' }: { mode: 'edit' | 'create' }) => {
  const [openPopover, setOpenPopover] = React.useState(false);
  const [openTooltip, setOpenTooltip] = React.useState(false);

  const [selectedImpact, setSelectedImpact] = React.useState<Impact | null>(null);

  const [searchValue, setSearchValue] = React.useState('');

  const isSearching = searchValue.length > 0;

  useHotkeys([
    [
      'p',
      () => {
        setOpenTooltip(false);
        setOpenPopover(true);
      },
    ],
  ]);

  return (
    <Popover open={openPopover} onOpenChange={setOpenPopover}>
      <Tooltip delayDuration={500} open={openTooltip} onOpenChange={setOpenTooltip}>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              aria-label="Set impacts"
              variant="ghost"
              size={mode === 'create' ? 'sm' : 'micro'}
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
        </TooltipTrigger>
        <TooltipContent
          hideWhenDetached
          side="bottom"
          align="start"
          sideOffset={6}
          className="flex items-center gap-2 bg-background border text-xs px-2 h-8"
        >
          <span className="text-primary">Change impact</span>
          <Kbd value="P" />
        </TooltipContent>
      </Tooltip>
      <PopoverContent className="w-[206px] p-0 rounded-lg" align="start" onCloseAutoFocus={(e) => e.preventDefault()} sideOffset={6}>
        <Command className="relative rounded-lg">
          <CommandInput
            value={searchValue}
            onValueChange={(searchValue) => {
              // If the user types a number, select the Impact like useHotkeys
              if ([0, 1, 2, 3, 4].includes(Number.parseInt(searchValue))) {
                setSelectedImpact(impacts[Number.parseInt(searchValue)]);
                setOpenTooltip(false);
                setOpenPopover(false);
                setSearchValue('');
                return;
              }
              setSearchValue(searchValue);
            }}
            className="text-[0.8125rem] leading-normal"
            placeholder="Set impact ..."
          />
          {!isSearching && <Kbd value="P" className="absolute top-3 right-[6px]" />}
          <CommandList>
            <CommandGroup>
              {impacts.map((Impact, index) => (
                <CommandItem
                  key={Impact.value}
                  value={Impact.value}
                  onSelect={(value) => {
                    setSelectedImpact(impacts.find((p) => p.value === value) || null);
                    setOpenTooltip(false);
                    setOpenPopover(false);
                    setSearchValue('');
                  }}
                  className="group rounded-md flex justify-between items-center w-full text-[0.8125rem] leading-normal text-primary"
                >
                  <div className="flex items-center">
                    <Impact.icon title={Impact.label} className="mr-2 size-4 fill-muted-foreground group-hover:fill-primary" />
                    <span>{Impact.label}</span>
                  </div>
                  <div className="flex items-center">
                    {selectedImpact?.value === Impact.value && <Check size={16} className="mr-3 text-success" />}
                    {!isSearching && <span className="text-xs">{index}</span>}
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
