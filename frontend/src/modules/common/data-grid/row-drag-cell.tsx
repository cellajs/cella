import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { setCustomNativeDragPreview } from '@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CellComponent } from './cell';
import type { CellRendererProps } from './types';
import { cn } from './utils/grid-utils';

/**
 * Internal drag type for data-grid row drag-and-drop.
 * @internal
 */
const ROW_DRAG_TYPE = 'rdg-row';
type RowDragData = { type: typeof ROW_DRAG_TYPE; rowIdx: number };
type DropZone = 'top' | 'bottom' | 'center';

function isRowDragData(data: Record<string, unknown>): data is RowDragData {
  return data.type === ROW_DRAG_TYPE;
}

/** Resolve the cursor's nearest allowed drop zone, or null when the row blocks all zones. */
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

/** Mutates drop-edge attributes without rerendering; a bottom edge may paint on the next row while the drop keeps the original zone. */
function setRowDropEdge(
  rowEl: HTMLElement | null,
  zone: DropZone | null,
  prevRowElRef: { current: HTMLElement | null },
  allowRedirect = true,
) {
  let targetEl: HTMLElement | null = null;
  let attrValue: DropZone | null = null;
  if (rowEl && zone !== null) {
    if (zone === 'bottom') {
      const next = rowEl.nextElementSibling;
      // Redirect only to an accepting next grid row, skipping measurement and focus nodes, so the indicator sits on a droppable area.
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
  onRowReparent?: (fromIdx: number, toIdx: number) => void;
  /** Per-zone drop validation. It runs on every drag move, so keep it O(1) or O(depth). */
  canDropRow?: (args: { fromIdx: number; toIdx: number; zone: 'top' | 'bottom' | 'center' }) => boolean;
  renderRowDragPreview?: (row: R) => ReactNode;
}

/** Drag and drop lives on cells because `display: contents` rows have no hit-test box; indicators update a data attribute, not React state. */
export function RowDragCell<R, SR>({
  rowIdx,
  row,
  column,
  className,
  config,
  ...props
}: CellRendererProps<R, SR> & { config: RowDragConfig<R> }) {
  const ref = useRef<HTMLDivElement>(null);
  // `isDragging` flips twice per drag, so React state stays off the per-mousemove path.
  const [isDragging, setIsDragging] = useState(false);
  const [preview, setPreview] = useState<{ container: HTMLElement; rect: DOMRect } | null>(null);
  // Last row element marked with `data-drop-edge`, cleared when the pointer reaches another row's cell.
  const prevRowElRef = useRef<HTMLElement | null>(null);

  const isDragHandle = column.rowDragHandle === true;
  const allowCenter = config.onRowReparent != null;
  const canDropRow = config.canDropRow;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Geometry is cached per drag to skip layout reads on pointer move, and refreshed on scroll because auto-scroll moves the row.
    let cached: { top: number; height: number } | null = null;
    const refreshRect = () => {
      const r = el.getBoundingClientRect();
      cached = { top: r.top, height: r.height };
    };
    const onScroll = () => {
      if (cached) refreshRect();
    };

    // Per-zone allowance for the current source; center is disabled without `onRowReparent`.
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
          // Passive capture-phase scroll catches any scrolling ancestor without per-element listeners.
          window.addEventListener('scroll', onScroll, { capture: true, passive: true });
        },
        onDrag: ({ self, source }) => {
          if (!isRowDragData(source.data)) return;
          const zone = (self.data as Record<string, unknown>).dropZone as DropZone | null;
          // Redirect bottom to the next row's top only when that row accepts this drag's `top` zone.
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
