import { type Dispatch, type SetStateAction, useState } from 'react';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';

/** Columns rebuilt every render; only the visibility toggles live in state, so headers follow a language switch. */
export function useColumnVisibility<TRow>(
  columns: ColumnOrColumnGroup<TRow>[],
): [ColumnOrColumnGroup<TRow>[], Dispatch<SetStateAction<ColumnOrColumnGroup<TRow>[]>>] {
  const [hiddenOverrides, setHiddenOverrides] = useState<Record<string, boolean>>({});
  const visibleColumns = columns.map((column) => ({ ...column, hidden: hiddenOverrides[column.key] ?? column.hidden }));
  const setColumns: Dispatch<SetStateAction<ColumnOrColumnGroup<TRow>[]>> = (updater) => {
    const nextColumns = typeof updater === 'function' ? updater(visibleColumns) : updater;
    setHiddenOverrides((prev) => {
      const next = { ...prev };
      for (const column of nextColumns) {
        if (column.hidden !== undefined) next[column.key] = column.hidden;
      }
      return next;
    });
  };
  return [visibleColumns, setColumns];
}
