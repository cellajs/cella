import { type RefObject, useEffect, useRef } from 'react';
import type { RenderEditCellProps } from '../types';

/** External-editor defaults: cell content stays visible during the single frame edit mode lasts. */
export const externalEditorOptions = {
  editorType: 'text',
  displayCellContent: true,
  commitOnOutsideClick: false,
} as const;

type Props<TRow> = Pick<RenderEditCellProps<TRow>, 'onClose'> & {
  /** Opens the editor; receives the grid cell so the sheet or dialog can return focus to it. */
  open: (cell: HTMLElement | null) => void;
};

/**
 * For editors that live outside the grid (a sheet, a dialog). Entering edit mode opens the editor
 * and leaves edit mode at once without committing: the external editor persists on its own, and
 * the column keeps the editable affordances (pencil, text cursor, double click, Enter).
 */
export function RenderExternalEditor<TRow>({ open, onClose }: Props<TRow>) {
  const probeRef = useRef<HTMLSpanElement>(null);

  // Runs once per edit-mode entry.
  useEffect(() => {
    open(probeRef.current?.closest<HTMLElement>('[role="gridcell"]') ?? null);
    onClose();
  }, []);

  return <span ref={probeRef} aria-hidden className="hidden" />;
}

/**
 * A ref that re-resolves the cell by grid position on every read: the node handed to `open`
 * is unmounted the moment edit mode ends, so focus restoration needs its successor.
 */
export function liveCellRef(cell: HTMLElement | null): RefObject<HTMLElement | null> {
  const grid = cell?.closest<HTMLElement>('[role="grid"]') ?? null;
  const rowIndex = cell?.closest('[role="row"]')?.getAttribute('aria-rowindex');
  const colIndex = cell?.getAttribute('aria-colindex');

  return {
    get current() {
      if (!grid || !rowIndex || !colIndex) return null;
      return grid.querySelector<HTMLElement>(
        `[role="row"][aria-rowindex="${rowIndex}"] [role="gridcell"][aria-colindex="${colIndex}"]`,
      );
    },
  };
}
