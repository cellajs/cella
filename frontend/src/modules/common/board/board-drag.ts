import type { Edge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import type { KeyboardEvent } from 'react';
import { createContext, useContext } from 'react';

/** Data attached to panel drag sources and drop targets for panel reordering */
export type PanelReorderDragData = {
  dragItem: true;
  type: 'panelReorder';
  panelId: string;
};

/** Type guard for panel reorder drag data */
export const isPanelReorderDragData = (data: Record<string | symbol, unknown>): data is PanelReorderDragData => {
  return data.dragItem === true && data.type === 'panelReorder' && typeof data.panelId === 'string';
};

/** Compute new panel order after dragging sourceId relative to targetId. Returns null if unchanged. */
export function reorderPanels(
  currentOrder: string[],
  sourceId: string,
  targetId: string,
  edge: Edge | null,
): string[] | null {
  const fromIndex = currentOrder.indexOf(sourceId);
  const toIndex = currentOrder.indexOf(targetId);
  if (fromIndex === -1 || toIndex === -1) return null;

  const newOrder = currentOrder.filter((id) => id !== sourceId);
  const newTargetIdx = newOrder.indexOf(targetId);
  const insertIdx = edge === 'right' ? newTargetIdx + 1 : newTargetIdx;
  newOrder.splice(insertIdx, 0, sourceId);

  if (newOrder.every((id, i) => currentOrder[i] === id)) return null;
  return newOrder;
}

/** Context value for panel drag handle and keyboard reorder */
interface PanelDragContext {
  /** Callback ref to register the drag handle element */
  registerHandle: (el: HTMLElement | null) => void;
  /** Keyboard handler for arrow-key reordering (attach to onKeyDown) */
  onKeyDown: (e: KeyboardEvent) => void;
  /** Toggle the current panel collapsed/expanded */
  onToggleCollapsed: () => void;
  /** Panel position info for ARIA labels */
  index: number;
  total: number;
}

/** Context for panel children to register their drag handle element and keyboard reorder */
export const PanelDragHandleContext = createContext<PanelDragContext | null>(null);

/** Returns drag handle registration and keyboard handler. Returns null if the panel is not reorderable. */
export const usePanelDragHandle = () => useContext(PanelDragHandleContext);
