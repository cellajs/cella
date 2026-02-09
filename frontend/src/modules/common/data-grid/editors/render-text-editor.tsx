import type { RenderEditCellProps } from '../types';

export const textEditorClassname = 'rdg-text-editor';

function autoFocusAndSelect(input: HTMLInputElement | null) {
  input?.focus();
  input?.select();
}

// TODO-038 use shadcn input component? is this used?
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
      value={row[column.key as keyof TRow] as unknown as string}
      onChange={(event) => onRowChange({ ...row, [column.key]: event.target.value })}
      onBlur={() => onClose(true, false)}
    />
  );
}
