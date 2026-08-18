import { createContext, type ReactNode, useContext } from 'react';

export interface TreeContextValue {
  onToggle: (id: string) => void;
  /** Pixel height of each row; must match the `rowHeight` passed to `<DataTable>`. */
  rowHeight: number;
  /** Max nesting depth, inclusive; rows at `maxDepth - 1` take a "deepest" visual. */
  maxDepth?: number;
}

const TreeContext = createContext<TreeContextValue | null>(null);

/** Wrap a tree-style `<DataTable>` so its `ExpandToggleColumn` cells can read the values from `useTreeRows`. */
export function TreeProvider({ value, children }: { value: TreeContextValue; children: ReactNode }) {
  return <TreeContext.Provider value={value}>{children}</TreeContext.Provider>;
}

export function useTreeContext(): TreeContextValue {
  const v = useContext(TreeContext);
  if (!v) throw new Error('useTreeContext: missing <TreeProvider>. Wrap your tree-style DataTable in <TreeProvider>.');
  return v;
}
