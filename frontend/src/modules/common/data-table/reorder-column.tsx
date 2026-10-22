import { ChevronDownIcon, ChevronUpIcon, GripVerticalIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SrOnlyHeader } from '~/modules/common/data-table/columns';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/modules/ui/dropdown-menu';
import { cn } from '~/utils/cn';

interface ReorderHandleProps {
  /** Names the row this handle moves, so its menu button says which one. */
  name: string;
  /** Steps the row one place; the table persists the new order and announces the new position. */
  onMove: (step: -1 | 1) => void;
  isFirst: boolean;
  isLast: boolean;
}

/**
 * Grip a pointer drags and a click opens as a move menu. Pragmatic drag and drop rides the native drag API, which no
 * key starts, and its guidelines rule out arrow-key dragging, so the menu is the alternative they prescribe. The
 * `data-drag-handle` attribute marks this button as the row's drag source, which `data-grid/row-drag.tsx` reads.
 */
function ReorderHandle({ name, onMove, isFirst, isLast }: ReorderHandleProps) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  // A press that turns into a drag must leave the menu shut, so a mouse opens it on the click and a drag eats that click
  const isDraggingRef = useRef(false);

  const gripButton = (
    <button
      type="button"
      data-drag-handle
      aria-label={`${t('c:reorder')}: ${name}`}
      className="flex size-7 cursor-grab items-center justify-center rounded-sm text-muted-foreground hover:bg-accent/50 hover:text-foreground data-popup-open:bg-accent/50 data-popup-open:text-foreground"
      onDragStart={() => {
        isDraggingRef.current = true;
        setMenuOpen(false);
      }}
      onDragEnd={() => {
        // A frame of delay keeps a click trailing the drop from opening the menu
        requestAnimationFrame(() => {
          isDraggingRef.current = false;
        });
      }}
      onClick={(event) => {
        // A key press (detail 0) opens the menu through Base UI, which moves focus to the first item
        if (event.detail === 0 || isDraggingRef.current) return;
        setMenuOpen((open) => !open);
      }}
    >
      <GripVerticalIcon className="size-3.5" />
    </button>
  );

  return (
    <DropdownMenu
      open={menuOpen}
      onOpenChange={(open, details) => {
        // A mouse press may turn into a drag, so there the click decides; a key press and every close apply at once
        if (details.reason === 'trigger-press' && details.event.type === 'mousedown') return;
        setMenuOpen(open);
      }}
    >
      <DropdownMenuTrigger render={gripButton} />
      <DropdownMenuContent align="start" className="min-w-40">
        <DropdownMenuItem disabled={isFirst} onClick={() => onMove(-1)}>
          <ChevronUpIcon />
          {t('c:move_up')}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={isLast} onClick={() => onMove(1)}>
          <ChevronDownIcon />
          {t('c:move_down')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface ReorderColumnOptions<TRow> {
  /** The row name the handle's menu button carries. */
  getName: (row: TRow) => string;
  /** Steps the row at `rowIdx` one place, with the table's own persist and announce. */
  onMove: (rowIdx: number, step: -1 | 1) => void;
  rowCount: number;
  /** Extra classes for the grip's cell, for a table that places it itself. */
  cellClass?: string;
}

/** Grip column of a reorderable table: a drag calls the grid's `onRowReorder`, the menu's single steps call `onMove`. */
export function reorderColumn<TRow>({ getName, onMove, rowCount, cellClass }: ReorderColumnOptions<TRow>): ColumnOrColumnGroup<TRow> {
  return {
    key: 'reorder',
    name: '',
    width: 36,
    maxWidth: 36,
    cellClass: cn('justify-center', cellClass),
    rowDragHandle: true,
    renderHeaderCell: () => <SrOnlyHeader label="c:order" />,
    renderCell: ({ row, rowIdx }) => (
      <ReorderHandle name={getName(row)} isFirst={rowIdx === 0} isLast={rowIdx === rowCount - 1} onMove={(step) => onMove(rowIdx, step)} />
    ),
  };
}
