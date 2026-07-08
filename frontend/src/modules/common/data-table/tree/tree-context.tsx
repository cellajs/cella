import { createContext, type ReactNode, useContext } from 'react';

export interface TreeContextValue {
  /** Toggle a row's expansion state by id. */
  onToggle: (id: string) => void;
  /**
   * Pixel height of each row, needed by the SVG connector layout in
   * `RenderExpandToggle`. Must match the `rowHeight` passed to `<DataTable>`.
   */
  rowHeight: number;
  /**
   * Optional max nesting depth (inclusive). When set, rows at `maxDepth - 1`
   * adopt a "deepest" visual so the depth limit is visible at a glance.
   */
  maxDepth?: number;
}

const TreeContext = createContext<TreeContextValue | null>(null);

/**
 * Wrap a tree-style `<DataTable>` so its `ExpandToggleColumn` cells can read
 * the toggle handler, row height, and depth limit. Pair with `useTreeRows`.
 */
export function TreeProvider({ value, children }: { value: TreeContextValue; children: ReactNode }) {
  return <TreeContext.Provider value={value}>{children}</TreeContext.Provider>;
}

export function useTreeContext(): TreeContextValue {
  const v = useContext(TreeContext);
  if (!v) throw new Error('useTreeContext: missing <TreeProvider>. Wrap your tree-style DataTable in <TreeProvider>.');
  return v;
}
