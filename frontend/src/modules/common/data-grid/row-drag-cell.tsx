import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { setCustomNativeDragPreview } from '@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CellComponent } from './cell';
import type { CellRendererProps } from './types';
import { cn } from './utils/grid-utils';

/**
 * Internal type used by data-grid's row drag-and-drop wiring.
 * @internal
 */
const ROW_DRAG_TYPE = 'rdg-row';
type RowDragData = { type: typeof ROW_DRAG_TYPE; rowIdx: number };
type DropZone = 'top' | 'bottom' | 'center';

function isRowDragData(data: Record<string, unknown>): data is RowDragData {
  return data.type === ROW_DRAG_TYPE;
}

/**
 * Resolve the drop zone given a cursor position and a per-zone allowance
 * predicate. Picks the user's natural choice from cursor position; if that
 * zone is disallowed, falls back to the next-nearest allowed zone. Returns
 * `null` when no zone is allowed (drop is fully blocked on this row).
 */
function resolveDropZone(
  rectTop: number,
  rectHeight: number,
  clientY: number,
  isZoneAllowed: (zone: DropZone) => boolean,
): DropZone | null {
  const ratio = (clientY - rectTop) / rectHeight;
  // Preference order = natural zone first, then the closer of the two others.
  let preference: DropZone[];
  if (ratio < 0.25) preference = ['top', 'center', 'bottom'];
  else if (ratio > 0.75) preference = ['bottom', 'center', 'top'];
  else if (ratio < 0.5) preference = ['center', 'top', 'bottom'];
  else preference = ['center', 'bottom', 'top'];
  for (const zone of preference) if (isZoneAllowed(zone)) return zone;
  return null;
}

/**
 * Imperatively set/clear `data-drop-edge` on a row element. Mutating the DOM
 * directly (instead of React state) avoids a render storm during drag.
 *
 * A `bottom` zone on row N is painted as `top` on row N+1 so the indicator
 * doesn't jump across the row seam; the last row falls back to `bottom` on
 * itself. The visual edge is therefore independent of the logical drop zone
 * stored in `self.data.dropZone` — `onDrop` still uses the original zone.
 */
function setRowDropEdge(
  rowEl: HTMLElement | null,
  zone: DropZone | null,
  prevRowElRef: { current: HTMLElement | null },
  allowRedirect = true,
) {
  // Resolve which element to mark and with which attribute value.
  let targetEl: HTMLElement | null = null;
  let attrValue: DropZone | null = null;
  if (rowEl && zone !== null) {
    if (zone === 'bottom') {
      const next = rowEl.nextElementSibling;
      // Only redirect to the next .rdg-row sibling. This skips ancillary nodes
      // (focus sinks, measuring cells) that data-grid renders alongside rows.
      // Skip the redirect when the next row would reject this drag's `top`
      // zone — otherwise the indicator gets painted on a row whose hit area
      // refuses the drop, the user chases it, and the indicator vanishes.
      if (allowRedirect && next instanceof HTMLElement && next.classList.contains('rdg-row')) {
        targetEl = next;
        attrValue = 'top';
      } else {
        targetEl = rowEl;
        attrValue = 'bottom';
      }
    } else {
      targetEl = rowEl;
      attrValue = zone;
    }
  }

  const prev = prevRowElRef.current;
  if (prev && prev !== targetEl) {
    prev.removeAttribute('data-drop-edge');
  }
  if (!targetEl) {
    prevRowElRef.current = null;
    return;
  }
  if (targetEl.getAttribute('data-drop-edge') !== attrValue) {
    targetEl.setAttribute('data-drop-edge', attrValue!);
  }
  prevRowElRef.current = targetEl;
}

export interface RowDragConfig<R> {
  onRowReorder: (fromIdx: number, toIdx: number, edge: 'top' | 'bottom') => void;
  /** When provided, the middle 50% of each row becomes a "reparent" drop zone. */
  onRowReparent?: (fromIdx: number, toIdx: number) => void;
  /**
   * Optional per-zone drop validation. When provided, the predicate is
   * consulted on hover to decide whether each zone is a valid target. If the
   * cursor's natural zone is blocked but another zone is allowed, the drop
   * indicator falls back to the nearest allowed zone. If all three are blocked,
   * no indicator is shown and `onDrop` is suppressed.
   *
   * Keep this fast (O(1)/O(depth)). Called on every drag move.
   */
  canDropRow?: (args: { fromIdx: number; toIdx: number; zone: 'top' | 'bottom' | 'center' }) => boolean;
  /** Optional content rendered inside the native drag preview. Defaults to a generic preview. */
  renderRowDragPreview?: (row: R) => ReactNode;
}

/**
 * A renderCell wrapper that attaches drag source + drop target listeners to
 * each cell. Used internally by `<DataGrid>` when `onRowReorder` is set.
 *
 * Per-cell wiring (rather than per-row) is required because data-grid uses
 * `display: contents` on the row container, so the row element has no
 * bounding rect for hit-testing. Drop indicators are written imperatively to
 * the row element (`data-drop-edge` attribute) and styled by CSS — no React
 * state changes during drag, and no `:has()` selectors.
 */
export function RowDragCell<R, SR>({
  rowIdx,
  row,
  column,
  className,
  config,
  ...props
}: CellRendererProps<R, SR> & { config: RowDragConfig<R> }) {
  const ref = useRef<HTMLDivElement>(null);
  // `isDragging` only flips twice per drag (start + end), so React state is
  // fine here — it's not on the per-mousemove hot path.
  const [isDragging, setIsDragging] = useState(false);
  const [preview, setPreview] = useState<{ container: HTMLElement; rect: DOMRect } | null>(null);
  // Tracks the row element we last marked with `data-drop-edge` so we can
  // clear it when the pointer moves to a different row's cell.
  const prevRowElRef = useRef<HTMLElement | null>(null);

  const isDragHandle = column.rowDragHandle === true;
  const allowCenter = config.onRowReparent != null;
  const canDropRow = config.canDropRow;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Cache the cell's rect on enter, reuse for every onDrag in this session.
    // `getBoundingClientRect()` per mousemove forces a synchronous layout flush
    // (~0.1–0.3ms each, more on large tables). Caching makes drop-zone math
    // O(1) regardless of table size. Refresh on scroll because rect.top is
    // viewport-relative and auto-scroll can move the cell mid-drag.
    let cached: { top: number; height: number } | null = null;
    const refreshRect = () => {
      const r = el.getBoundingClientRect();
      cached = { top: r.top, height: r.height };
    };
    const onScroll = () => {
      if (cached) refreshRect();
    };

    // Build a per-zone allowance predicate scoped to the current source.
    // Center is structurally disabled when no `onRowReparent` is wired.
    const buildIsZoneAllowed = (fromIdx: number) => (zone: DropZone) => {
      if (zone === 'center' && !allowCenter) return false;
      if (canDropRow && !canDropRow({ fromIdx, toIdx: rowIdx, zone })) return false;
      return true;
    };

    const cleanups = [
      dropTargetForElements({
        element: el,
        canDrop: ({ source }) => {
          if (!isRowDragData(source.data) || source.data.rowIdx === rowIdx) return false;
          // Row is a valid target if at least one zone is allowed.
          const isAllowed = buildIsZoneAllowed(source.data.rowIdx);
          return isAllowed('top') || isAllowed('bottom') || isAllowed('center');
        },
        getData: ({ input, source }) => {
          if (!cached) refreshRect();
          const fromIdx = isRowDragData(source.data) ? source.data.rowIdx : -1;
          const zone = resolveDropZone(cached!.top, cached!.height, input.clientY, buildIsZoneAllowed(fromIdx));
          return { type: ROW_DRAG_TYPE, rowIdx, dropZone: zone } as Record<string, unknown>;
        },
        onDragEnter: () => {
          refreshRect();
          // Listen passively for scroll on capture so we catch any scrolling
          // ancestor (auto-scroll container, window) without per-element setup.
          window.addEventListener('scroll', onScroll, { capture: true, passive: true });
        },
        onDrag: ({ self, source }) => {
          if (!isRowDragData(source.data)) return;
          const zone = (self.data as Record<string, unknown>).dropZone as DropZone | null;
          // Only redirect bottom→top into the next row when that row would
          // accept this drag's `top` zone; otherwise paint on the current row.
          const allowRedirect =
            zone !== 'bottom' || !canDropRow
              ? true
              : canDropRow({ fromIdx: source.data.rowIdx, toIdx: rowIdx + 1, zone: 'top' });
          setRowDropEdge(el.parentElement, zone, prevRowElRef, allowRedirect);
        },
        onDragLeave: () => {
          window.removeEventListener('scroll', onScroll, { capture: true });
          cached = null;
          setRowDropEdge(el.parentElement, null, prevRowElRef);
        },
        onDrop: ({ self, source }) => {
          window.removeEventListener('scroll', onScroll, { capture: true });
          cached = null;
          setRowDropEdge(el.parentElement, null, prevRowElRef);
          if (!isRowDragData(source.data)) return;
          const zone = (self.data as Record<string, unknown>).dropZone as DropZone | null;
          if (zone === null) return;
          // Final guard: re-check the predicate at drop time in case state moved.
          if (canDropRow && !canDropRow({ fromIdx: source.data.rowIdx, toIdx: rowIdx, zone })) return;
          if (zone === 'center') config.onRowReparent?.(source.data.rowIdx, rowIdx);
          else config.onRowReorder(source.data.rowIdx, rowIdx, zone);
        },
      }),
    ];

    if (isDragHandle) {
      cleanups.push(
        draggable({
          element: el,
          getInitialData: (): RowDragData => ({ type: ROW_DRAG_TYPE, rowIdx }),
          onGenerateDragPreview: ({ nativeSetDragImage }) => {
            setCustomNativeDragPreview({
              nativeSetDragImage,
              getOffset: () => ({ x: 16, y: 16 }),
              render: ({ container }) => {
                const rowEl = el.parentElement;
                if (rowEl) setPreview({ container, rect: rowEl.getBoundingClientRect() });
              },
            });
          },
          onDragStart: () => setIsDragging(true),
          onDrop: () => {
            setIsDragging(false);
            setPreview(null);
          },
        }),
      );
    }

    return combine(...cleanups);
  }, [rowIdx, allowCenter, canDropRow, isDragHandle, config]);

  const dragPreview =
    preview &&
    createPortal(
      config.renderRowDragPreview ? (
        config.renderRowDragPreview(row)
      ) : (
        <div className="rounded border bg-background px-2 py-1 text-sm shadow-md">Row {rowIdx + 1}</div>
      ),
      preview.container,
    );

  return (
    <>
      <CellComponent
        ref={ref}
        rowIdx={rowIdx}
        row={row}
        column={column}
        className={cn(className, { 'opacity-40': isDragging })}
        {...props}
      />
      {dragPreview}
    </>
  );
}
