import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { Combobox, ComboboxItem, ComboboxList } from '~/modules/ui/combobox';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '~/modules/ui/drawer';
import { Popover, PopoverContent } from '~/modules/ui/popover';
import type { RenderEditCellProps } from '../types';

/**
 * Recommended `editorOptions` for any column using `RenderEnumSelect`.
 * - `commitOnOutsideClick: false`: the popover is portaled, so the grid's
 *   window-level outside-click handler would otherwise treat its own popover
 *   as "outside" and double-commit. We commit on item select instead.
 * - `displayCellContent: true`: keep the cell content visible underneath
 *   the popover/drawer while the editor is mounted.
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
 * Generic enum-select editor for data-grid cells.
 *
 * Renders a popover (desktop) or drawer (mobile) anchored to the gridcell.
 * Uses base-ui's Popover/Drawer directly (not via the dropdowner store) so
 * the editor lifecycle is fully owned by `EditCell`; commit/dismiss flow
 * through the standard `onRowChange` / `onClose` callbacks with no extra
 * coordination layer.
 *
 * Two usage modes:
 * - **Flat field** (`field`): shorthand for top-level row fields.
 * - **Custom** (`currentValue` + `setValue`): for nested/derived fields, e.g.
 *   `currentValue={row.membership?.role}` + `setValue={(r, v) => ({ ...r, membership: { ...r.membership, role: v } })}`.
 *
 * Always pair the column with `editorOptions: enumSelectEditorOptions`.
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

  // Commit the chosen value via EditCell's onRowChange (commitChanges=true).
  // EditCell handles flushSync + focus restoration to the cell, same path
  // as text and toggle editors.
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
          // Skip base-ui's focus restoration: the cell DOM the popover is
          // anchored to gets replaced when the editor closes, so restoring
          // there focuses a detached node. EditCell already restores focus
          // to the new cell via `shouldFocusCell=true`.
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
