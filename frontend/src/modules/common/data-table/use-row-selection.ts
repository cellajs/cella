import { useMemo, useState } from 'react';

/** Selected rows as the objects they were picked from, so bars read their fields even after the list refetches. */
export function useRowSelection<TRow extends { id: string }>(rows: TRow[] | undefined) {
  const [selected, setSelected] = useState<TRow[]>([]);

  const onSelectedRowsChange = (value: Set<string>) => {
    if (rows) setSelected(rows.filter((row) => value.has(row.id)));
  };

  const selectedRowIds = useMemo(() => new Set(selected.map((s) => s.id)), [selected]);

  return { selected, selectedRowIds, onSelectedRowsChange, clearSelection: () => setSelected([]) };
}
