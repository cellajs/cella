import { createContext, useContext } from 'react';
import type { SelectHeaderRowEvent, SelectRowEvent } from '../types';

export interface RowSelectionContextValue {
  readonly isRowSelected: boolean;
  readonly isRowSelectionDisabled: boolean;
}

/** Shares the selected data-grid rows with descendant components. */
export const RowSelectionContext = createContext<RowSelectionContextValue | undefined>(undefined);

/** Shares the data-grid row-selection callback with descendant components. */
export const RowSelectionChangeContext = createContext<
  // biome-ignore lint/suspicious/noExplicitAny: row-shape agnostic context shared across grids.
  ((selectRowEvent: SelectRowEvent<any>) => void) | undefined
>(undefined);

/** Provides row selection state and actions. */
export function useRowSelection() {
  const rowSelectionContext = useContext(RowSelectionContext);
  const rowSelectionChangeContext = useContext(RowSelectionChangeContext);

  if (rowSelectionContext === undefined || rowSelectionChangeContext === undefined) {
    throw new Error('useRowSelection must be used within renderCell');
  }

  return {
    isRowSelectionDisabled: rowSelectionContext.isRowSelectionDisabled,
    isRowSelected: rowSelectionContext.isRowSelected,
    onRowSelectionChange: rowSelectionChangeContext,
  };
}

export interface HeaderRowSelectionContextValue {
  readonly isRowSelected: boolean;
  readonly isIndeterminate: boolean;
}

/** Shares header row-selection state with descendant components. */
export const HeaderRowSelectionContext = createContext<HeaderRowSelectionContextValue | undefined>(undefined);

/** Shares the header row-selection callback with descendant components. */
export const HeaderRowSelectionChangeContext = createContext<
  ((selectRowEvent: SelectHeaderRowEvent) => void) | undefined
>(undefined);

/** Provides header row selection state and actions. */
export function useHeaderRowSelection() {
  const headerRowSelectionContext = useContext(HeaderRowSelectionContext);
  const headerRowSelectionChangeContext = useContext(HeaderRowSelectionChangeContext);

  if (headerRowSelectionContext === undefined || headerRowSelectionChangeContext === undefined) {
    throw new Error('useHeaderRowSelection must be used within renderHeaderCell');
  }

  return {
    isIndeterminate: headerRowSelectionContext.isIndeterminate,
    isRowSelected: headerRowSelectionContext.isRowSelected,
    onRowSelectionChange: headerRowSelectionChangeContext,
  };
}
