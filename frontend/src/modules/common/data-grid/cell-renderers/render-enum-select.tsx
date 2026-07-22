import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { Combobox, ComboboxItem, ComboboxList } from '~/modules/ui/combobox';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '~/modules/ui/drawer';
import { Popover, PopoverContent } from '~/modules/ui/popover';
import type { RenderEditCellProps } from '../types';

/**
 * Enum-editor defaults avoid double commits from its portaled popover and keep cell content visible.
 */
export const enumSelectEditorOptions = {
  editorType: 'select',
  commitOnOutsideClick: false,
  displayCellContent: true,
} as const;

export type EnumSelectOption<TValue extends string> = {
  value: TValue;
  label: ReactNode;
};

type Props<TRow, TValue extends string> = Pick<RenderEditCellProps<TRow>, 'onRowChange' | 'onClose'> & {
  row: TRow;
  /** List of allowed values, or pre-built `{ value, label }` options. */
  options: readonly TValue[] | readonly EnumSelectOption<TValue>[];
  /** Render the visible label for a value (only used when `options` is a plain string list). */
  renderOption?: (value: TValue) => ReactNode;
  /** Optional fixed width for the popover content (desktop only; drawer fills width on mobile). */
  width?: number;
  /** Shortcut: read/write a flat top-level field on the row. Mutually exclusive with `currentValue`/`setValue`. */
  field?: keyof TRow;
  /** Current value to show as selected. Provide together with `setValue` for nested/derived fields. */
  currentValue?: TValue;
  /** Build the next row from the chosen value (for nested or derived fields). */
  setValue?: (row: TRow, value: TValue) => TRow;
};

/**
 * Responsive enum editor supporting flat fields and custom nested value accessors.
 * `EditCell` owns its Base UI lifecycle; pair the column with `enumSelectEditorOptions`.
 */
export function RenderEnumSelect<TRow extends { id: string }, TValue extends string>({
  row,
  options,
  onRowChange,
  onClose,
  renderOption,
  width = 220,
  field,
  currentValue: currentValueProp,
  setValue,
}: Props<TRow, TValue>) {
  const probeRef = useRef<HTMLSpanElement>(null);
  // Resolved on mount; we re-render once we have the anchor so base-ui
  // positions correctly (it accepts `null` then re-positions when set).
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const isMobile = useBreakpointBelow('sm');

  useEffect(() => {
    const probe = probeRef.current;
    if (!probe) return;
    setAnchor((probe.closest('[role="gridcell"]') as HTMLElement | null) ?? probe);
  }, []);

  const currentValue: TValue | undefined = field !== undefined ? (row[field] as unknown as TValue) : currentValueProp;

  const buildNextRow = (value: TValue): TRow => {
    if (field !== undefined) return { ...row, [field]: value } as TRow;
    if (!setValue) throw new Error('RenderEnumSelect: provide either `field` or `setValue`.');
    return setValue(row, value);
  };

  // EditCell handles flushSync + focus restoration to the cell on commit,
  // same path as text and toggle editors.
  const handleSelect = (value: TValue) => {
    onRowChange(buildNextRow(value), true);
  };

  // ESC, outside click, drawer swipe → exit edit mode without committing.
  const handleOpenChange = (open: boolean) => {
    if (!open) onClose();
  };

  const menu = (
    <EnumSelectMenu currentValue={currentValue} options={options} renderOption={renderOption} onSelect={handleSelect} />
  );

  if (isMobile) {
    return (
      <>
        <span ref={probeRef} aria-hidden className="hidden" />
        <Drawer open onOpenChange={handleOpenChange}>
          <DrawerContent className="max-h-[70vh]">
            <DrawerHeader className="p-0">
              <span className="sr-only">
                <DrawerTitle>Choose</DrawerTitle>
                <DrawerDescription>Select an option</DrawerDescription>
              </span>
            </DrawerHeader>
            <div className="p-4">{menu}</div>
          </DrawerContent>
        </Drawer>
      </>
    );
  }

  return (
    <>
      <span ref={probeRef} aria-hidden className="hidden" />
      <Popover open onOpenChange={handleOpenChange} modal={false}>
        <PopoverContent
          anchor={anchor}
          align="start"
          className="z-301 p-0"
          // Skip restoration to the replaced anchor cell; EditCell focuses its new cell instance.
          finalFocus={false}
          style={{ width }}
        >
          {menu}
        </PopoverContent>
      </Popover>
    </>
  );
}

function EnumSelectMenu<TValue extends string>({
  currentValue,
  options,
  renderOption,
  onSelect,
}: {
  currentValue: TValue | undefined;
  options: readonly TValue[] | readonly EnumSelectOption<TValue>[];
  renderOption?: (value: TValue) => ReactNode;
  onSelect: (value: TValue) => void;
}) {
  const normalized: EnumSelectOption<TValue>[] = options.map((opt) =>
    typeof opt === 'string' ? { value: opt as TValue, label: renderOption?.(opt as TValue) ?? opt } : opt,
  );

  // The surrounding Popover/Drawer doesn't auto-focus a child, so we focus
  // the listbox explicitly to receive arrow/typeahead keys.
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <Combobox<TValue>
      inline
      openOnInputClick={false}
      items={normalized.map((o) => o.value)}
      value={currentValue ?? null}
      onValueChange={(value) => {
        if (value != null) onSelect(value);
      }}
    >
      <ComboboxList ref={listRef} className="rounded-lg p-1 outline-none" tabIndex={-1}>
        {normalized.map((opt) => (
          <ComboboxItem key={opt.value} value={opt.value} className="flex items-center gap-2 text-success">
            <span className="flex-1 text-foreground">{opt.label}</span>
          </ComboboxItem>
        ))}
      </ComboboxList>
    </Combobox>
  );
}
