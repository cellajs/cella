import { CheckIcon } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';
import { Button } from '~/modules/ui/button';
import { Drawer, DrawerContent, DrawerHeader, DrawerLead, DrawerRowGroup, DrawerTitle } from '~/modules/ui/drawer';
import { cn } from '~/utils/cn';

/** `group` heads the option's group; consecutive options with one heading form a group. */
export type SelectDrawerOption<TValue extends string> = { value: TValue; label: ReactNode; group?: string };

/** Consecutive options under one heading, in their given order. */
export function groupRuns<TOption extends { group?: string }>(options: readonly TOption[]) {
  const runs: { group?: string; options: TOption[] }[] = [];
  for (const option of options) {
    const run = runs.at(-1);
    if (run && run.group === option.group) run.options.push(option);
    else runs.push({ group: option.group, options: [option] });
  }
  return runs;
}

interface SelectDrawerRowsProps<TValue extends string> {
  options: readonly SelectDrawerOption<TValue>[];
  selected: readonly TValue[];
  onSelect: (value: TValue) => void;
}

/** Option rows on a bottom sheet, a check on each selected one: the rows of a single or multiple select below `sm`. */
export function SelectDrawerRows<TValue extends string>({ options, selected, onSelect }: SelectDrawerRowsProps<TValue>) {
  const rows = (runOptions: readonly SelectDrawerOption<TValue>[]) =>
    runOptions.map((option) => {
      const isSelected = selected.includes(option.value);
      return (
        <Button key={option.value} variant="row" aria-pressed={isSelected} className="justify-between" onClick={() => onSelect(option.value)}>
          {option.label}
          {isSelected && <CheckIcon className="text-success" />}
        </Button>
      );
    });

  return (
    <DrawerRowGroup>
      {groupRuns(options).map((run) =>
        run.group === undefined ? (
          <Fragment key={run.options[0].value}>{rows(run.options)}</Fragment>
        ) : (
          <Fragment key={run.group}>
            <p className="group-label px-4 pt-3 pb-1 text-xs">{run.group}</p>
            {rows(run.options)}
          </Fragment>
        ),
      )}
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
  /** Rendered below the rows, such as a filter's clear button. */
  footer?: ReactNode;
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
  footer,
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
          {footer}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
