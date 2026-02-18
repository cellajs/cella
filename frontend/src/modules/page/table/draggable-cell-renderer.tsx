import { useState } from 'react';
import { CellComponent } from '~/modules/common/data-grid/cell';
import { CellRendererProps } from '~/modules/common/data-grid/types';
import { cn } from '~/utils/cn';

interface DraggableCellRenderProps<R, SR> extends CellRendererProps<R, SR> {
  onRowReorder: (sourceIndex: number, targetIndex: number) => void;
}

export function DraggableCellRenderer<R, SR>({
  rowIdx,
  column,
  className,
  onRowReorder,
  ...props
}: DraggableCellRenderProps<R, SR>) {
  const [isDragging, setIsDragging] = useState(false);
  const [isOver, setIsOver] = useState(false);

  const cellClassName = cn(className, {
    'rdg-row-dragging': isDragging,
    'rdg-row-drag-over': isOver,
  });

  function onDragStart(event: React.DragEvent<HTMLDivElement>) {
    setIsDragging(true);

    // Create a drag image showing a preview of the row
    const cell = event.currentTarget;
    const row = cell.parentElement;

    if (row) {
      // Create a styled drag preview
      const dragImage = document.createElement('div');
      dragImage.style.cssText = `
        position: absolute;
        top: -9999px;
        left: -9999px;
        display: flex;
        align-items: center;
        gap: 8px;
        background: var(--background, #fff);
        border: 1px solid var(--border, #e5e5e5);
        border-radius: 6px;
        padding: 8px 16px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        font-size: 14px;
        max-width: 400px;
      `;

      // Get text content from visible cells (skip checkbox)
      const cells = row.querySelectorAll('.rdg-cell');
      const textParts: string[] = [];
      cells.forEach((c, i) => {
        if (i > 0 && i < 4) {
          const text = c.textContent?.trim();
          if (text) textParts.push(text);
        }
      });
      dragImage.textContent = textParts.join(' • ') || 'Moving row...';

      document.body.appendChild(dragImage);
      event.dataTransfer.setDragImage(dragImage, 0, 20);

      // Remove after browser captures the image
      requestAnimationFrame(() => {
        document.body.removeChild(dragImage);
      });
    }

    event.dataTransfer.setData('text/plain', String(rowIdx));
    event.dataTransfer.effectAllowed = 'move';
  }

  function onDragEnd() {
    setIsDragging(false);
  }

  function onDragOver(event: React.DragEvent<HTMLDivElement>) {
    // prevent default to allow drop
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }

  function onDrop(event: React.DragEvent<HTMLDivElement>) {
    setIsOver(false);
    // prevent the browser from redirecting in some cases
    event.preventDefault();
    onRowReorder(Number(event.dataTransfer.getData('text/plain')), rowIdx);
  }

  function onDragEnter(event: React.DragEvent<HTMLDivElement>) {
    if (isEventPertinent(event)) {
      setIsOver(true);
    }
  }

  function onDragLeave(event: React.DragEvent<HTMLDivElement>) {
    if (isEventPertinent(event)) {
      setIsOver(false);
    }
  }

  return (
    <CellComponent
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      rowIdx={rowIdx}
      column={column}
      className={cellClassName}
      {...props}
    />
  );
}

// only accept pertinent drag events:
// - ignore drag events going from the container to an element inside the container
// - ignore drag events going from an element inside the container to the container
function isEventPertinent(event: React.DragEvent) {
  const relatedTarget = event.relatedTarget as HTMLElement | null;

  return !event.currentTarget.contains(relatedTarget);
}
