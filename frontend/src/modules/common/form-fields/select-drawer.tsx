import { CheckIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '~/modules/ui/button';
import { Drawer, DrawerContent, DrawerHeader, DrawerLead, DrawerRowGroup, DrawerTitle } from '~/modules/ui/drawer';
import { cn } from '~/utils/cn';

export type SelectDrawerOption<TValue extends string> = { value: TValue; label: ReactNode };

interface SelectDrawerRowsProps<TValue extends string> {
  options: readonly SelectDrawerOption<TValue>[];
  selected: readonly TValue[];
  onSelect: (value: TValue) => void;
}

/** Option rows on a bottom sheet, a check on each selected one: the rows of a single or multiple select below `sm`. */
export function SelectDrawerRows<TValue extends string>({ options, selected, onSelect }: SelectDrawerRowsProps<TValue>) {
  return (
    <DrawerRowGroup>
      {options.map((option) => {
        const isSelected = selected.includes(option.value);
        return (
          <Button key={option.value} variant="row" aria-pressed={isSelected} className="justify-between" onClick={() => onSelect(option.value)}>
            {option.label}
            {isSelected && <CheckIcon className="text-success" />}
          </Button>
        );
      })}
    </DrawerRowGroup>
  );
}

interface SelectDrawerProps<TValue extends string> extends Pick<SelectDrawerRowsProps<TValue>, 'options' | 'onSelect'> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  /** Names the sheet for screen readers only. */
  titleHidden?: boolean;
  /** Names what the choice applies to, such as a table row, in place of the visible title. */
  lead?: ReactNode;
  value: TValue | undefined;
}

/** A single select as a bottom sheet; the caller closes it on select. */
export function SelectDrawer<TValue extends string>({
  open,
  onOpenChange,
  title,
  titleHidden,
  lead,
  options,
  value,
  onSelect,
}: SelectDrawerProps<TValue>) {
  const headerShown = !titleHidden && !lead;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader className={cn(!headerShown && 'sr-only')}>
          <DrawerTitle>{title}</DrawerTitle>
        </DrawerHeader>
        {/* The dropdowner drawer's inset, so a select sheet and a menu sheet start their rows at one height */}
        <div className={cn('flex flex-col gap-2 p-4 pb-[calc(1rem+var(--bottom-inset))]', headerShown && 'pt-0')}>
          {lead && <DrawerLead>{lead}</DrawerLead>}
          <SelectDrawerRows options={options} selected={value === undefined ? [] : [value]} onSelect={onSelect} />
        </div>
      </DrawerContent>
    </Drawer>
  );
}
