import { createContext, useContext } from 'react';

interface PanelDragContext {
  panelId: string;
  registerHandle: (el: HTMLElement | null) => void;
  /** Moves the panel one place, from the handle's arrow keys or its menu. */
  onMove: (step: -1 | 1) => void;
  onToggleCollapsed: () => void;
  /** Set while the browser draws the drag preview; the mounted handle portals its chip into it. */
  previewContainer: HTMLElement | null;
  index: number;
  total: number;
}

export const PanelDragHandleContext = createContext<PanelDragContext | null>(null);

interface PanelCollapseContextValue {
  panelId: string;
  onToggleCollapsed: () => void;
}

export const PanelCollapseContext = createContext<PanelCollapseContextValue | null>(null);

/** Collapse for the panel around it, reorderable or not. Null outside a board layout, such as in a loading skeleton. */
export const usePanelCollapse = () => useContext(PanelCollapseContext);

/**
 * Returns drag handle registration and the move handler. Returns null if the panel is not reorderable.
 * @public
 */
export const usePanelDragHandle = () => useContext(PanelDragHandleContext);
