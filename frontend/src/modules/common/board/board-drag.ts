import type { Edge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { createContext, useContext } from 'react';

export type PanelReorderDragData = { dragItem: true; type: 'panelReorder'; panelId: string };

export const isPanelReorderDragData = (data: Record<string | symbol, unknown>): data is PanelReorderDragData => {
  return data.dragItem === true && data.type === 'panelReorder' && typeof data.panelId === 'string';
};

/** Compute new panel order after dragging sourceId relative to targetId. Returns null if unchanged. */
export function reorderPanels(currentOrder: string[], sourceId: string, targetId: string, edge: Edge | null): string[] | null {
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

interface PanelDragContext {
  /** What the handle moves: a panel, or a whole group by its id. */
  panelId: string;
  registerHandle: (el: HTMLElement | null) => void;
  /** Moves the panel one place, from the handle's arrow keys or its menu. */
  onMove: (step: -1 | 1) => void;
  /** Collapses what the handle moves, or expands it when all of it is collapsed. */
  onToggleCollapsed: () => void;
  isCollapsed: boolean;
  /** Set while the browser draws the drag preview; the mounted handle portals its chip into it. */
  previewContainer: HTMLElement | null;
  index: number;
  total: number;
}

export const PanelDragHandleContext = createContext<PanelDragContext | null>(null);

/**
 * Returns drag handle registration and the move handler. Returns null if the panel is not reorderable.
 * @public
 */
export const usePanelDragHandle = () => useContext(PanelDragHandleContext);

export const PanelToggleContext = createContext<((panelId: string) => void) | null>(null);

/**
 * Collapses or expands one panel, also a panel in a group. Returns null if the panels are not reorderable.
 * @public
 */
export const usePanelToggle = () => useContext(PanelToggleContext);
