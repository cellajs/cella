import type { RenderEditCellProps } from '../types';

export const textEditorClassname = 'rdg-text-editor';

function autoFocusAndSelect(input: HTMLInputElement | null) {
  input?.focus();
  input?.select();
}

// TODO-038 use shadcn input component instead? But is this actually used or do we always add our own edit component?
export function textTextEditor<TRow, TSummaryRow>({
  row,
  column,
  onRowChange,
  onClose,
}: RenderEditCellProps<TRow, TSummaryRow>) {
  return (
    <input
      className={textEditorClassname}
      ref={autoFocusAndSelect}
      value={String(row[column.key as keyof TRow])}
      onChange={(event) => onRowChange({ ...row, [column.key]: event.target.value })}
      onBlur={() => onClose(true, false)}
    />
  );
}
