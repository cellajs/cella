import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { SelectDrawer, type SelectDrawerOption } from '~/modules/common/form-fields/select-drawer';
import { NamedText } from '~/modules/common/named-text';
import { Combobox, ComboboxItem, ComboboxItemIndicator, ComboboxList } from '~/modules/ui/combobox';
import { Popover, PopoverContent } from '~/modules/ui/popover';
import type { RenderEditCellProps } from '../types';

/** Enum-editor defaults: no double commit from the portaled popover, and cell content stays visible. */
export const enumSelectEditorOptions = { editorType: 'select', commitOnOutsideClick: false, displayCellContent: true } as const;

type Props<TRow, TValue extends string> = Pick<RenderEditCellProps<TRow>, 'column' | 'onRowChange' | 'onClose'> & {
  row: TRow;
  options: readonly TValue[] | readonly SelectDrawerOption<TValue>[];
  /** Only for a plain string list of `options` */
  renderOption?: (value: TValue) => ReactNode;
  /** In px, for the desktop popover */
  width?: number;
  /** A flat row field to read and write; excludes `currentValue` and `setValue` */
  field?: keyof TRow;
  /** With `setValue`, for nested or derived fields */
  currentValue?: TValue;
  setValue?: (row: TRow, value: TValue) => TRow;
};

/** `EditCell` owns the Base UI lifecycle; pair the column with `enumSelectEditorOptions`. A row's `name` heads the mobile drawer. */
export function RenderEnumSelect<TRow extends { id: string; name?: string | null }, TValue extends string>({
  row,
  column,
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
  // Resolved on mount: base-ui accepts a `null` anchor and repositions once it is set.
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

  // EditCell handles flushSync and focus restoration to the cell on commit.
  const handleSelect = (value: TValue) => onRowChange(buildNextRow(value), true);

  // ESC, outside click, drawer swipe → exit edit mode without committing.
  const handleOpenChange = (open: boolean) => {
    if (!open) onClose();
  };

  const normalized: SelectDrawerOption<TValue>[] = options.map((opt) =>
    typeof opt === 'string' ? { value: opt as TValue, label: renderOption?.(opt as TValue) ?? opt } : opt,
  );

  if (isMobile) {
    // The sheet covers the row, so it names the row it edits
    const lead =
      row.name && typeof column.name === 'string' ? (
        <NamedText i18nKey="c:change_field.text" name={row.name} values={{ field: column.name }} />
      ) : undefined;

    return (
      <SelectDrawer
        open
        onOpenChange={handleOpenChange}
        title={column.name}
        lead={lead}
        options={normalized}
        value={currentValue}
        onSelect={handleSelect}
      />
    );
  }

  return (
    <>
      <span ref={probeRef} aria-hidden className="hidden" />
      <Popover open onOpenChange={handleOpenChange} modal={false}>
        <PopoverContent
          anchor={anchor}
          align="start"
          positionerClassName="z-301"
          className="p-0"
          // Skip restoration to the replaced anchor cell; EditCell focuses its new cell instance.
          finalFocus={false}
          style={{ width }}
        >
          <EnumSelectMenu currentValue={currentValue} options={normalized} onSelect={handleSelect} />
        </PopoverContent>
      </Popover>
    </>
  );
}

function EnumSelectMenu<TValue extends string>({
  currentValue,
  options,
  onSelect,
}: {
  currentValue: TValue | undefined;
  options: SelectDrawerOption<TValue>[];
  onSelect: (value: TValue) => void;
}) {
  // The Popover does not auto-focus a child, so the listbox is focused for arrow and typeahead keys.
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => listRef.current?.focus({ preventScroll: true }), []);

  return (
    <Combobox<TValue>
      inline
      openOnInputClick={false}
      items={options.map((o) => o.value)}
      value={currentValue ?? null}
      onValueChange={(value) => {
        if (value != null) onSelect(value);
      }}
    >
      <ComboboxList ref={listRef} className="rounded-lg p-1 outline-hidden" tabIndex={-1}>
        {options.map((opt) => (
          <ComboboxItem key={opt.value} value={opt.value} className="flex items-center gap-2">
            <span className="text-foreground flex-1">{opt.label}</span>
            <ComboboxItemIndicator />
          </ComboboxItem>
        ))}
      </ComboboxList>
    </Combobox>
  );
}
