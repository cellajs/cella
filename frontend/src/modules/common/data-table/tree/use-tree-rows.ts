import { useCallback, useMemo, useRef, useState } from 'react';
import { getRelativeOrder } from 'shared/utils/display-order';
import { buildTree, type TreeItem, type TreeRow } from '~/modules/common/data-table/tree/build-tree';
import type { TreeContextValue } from '~/modules/common/data-table/tree/tree-context';

export type TreeMutate = (id: string, ops: { displayOrder?: number; parentId?: string | null }) => void;

export interface UseTreeRowsOptions {
  /** Initial expansion baseline. `true` = all expanded, `false` = all collapsed. */
  defaultExpanded?: boolean;
  /** Pixel height of each row, forwarded to `TreeProvider`. */
  rowHeight: number;
  /** Maximum allowed nesting depth, inclusive. */
  maxDepth?: number;
  mutate: TreeMutate;
}

export type DropZone = 'top' | 'bottom' | 'center';

interface CanDropArgs {
  fromIdx: number;
  toIdx: number;
  zone: DropZone;
}

function isSelfOrDescendantOf(rootId: string, candidateId: string, byId: Map<string, TreeItem>): boolean {
  if (candidateId === rootId) return true;
  let current = byId.get(candidateId);
  while (current) {
    const { parentId } = current;
    if (parentId === rootId) return true;
    if (parentId == null) return false;
    current = byId.get(parentId);
  }
  return false;
}

/** Owns expansion, drop validation, reordering, and reparenting; pair its context with `TreeProvider` and `ExpandToggleColumn`. */
export function useTreeRows<T extends TreeItem>(options: UseTreeRowsOptions) {
  const [toggledIds, setToggledIds] = useState<Set<string>>(new Set());
  // A ref keeps the callbacks below stable while they read the current options.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const onToggle = useCallback((id: string) => {
    setToggledIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const buildRows = useCallback(
    (items: T[]): TreeRow<T>[] => buildTree(items, { toggledIds, defaultExpanded: optionsRef.current.defaultExpanded }),
    [toggledIds],
  );

  const canDrop = useCallback((rows: readonly TreeRow<T>[] | undefined, { fromIdx, toIdx, zone }: CanDropArgs): boolean => {
    if (!rows) return false;
    const dragged = rows[fromIdx];
    const target = rows[toIdx];
    if (!dragged || !target) return false;
    const { maxDepth } = optionsRef.current;

    // Cycle prevention: target must not be the dragged row or any descendant.
    const byId = new Map(rows.map((row) => [row.id, row] as const));
    if (isSelfOrDescendantOf(dragged.id, target.id, byId)) return false;

    // 'center' makes a child, as does 'bottom' on an expanded parent; otherwise the target's depth is reused.
    const becomesChild = zone === 'center' || (zone === 'bottom' && target._hasChildren && target._isExpanded);
    const targetDepth = becomesChild ? target._depth + 1 : target._depth;
    if (maxDepth !== undefined && targetDepth + dragged._subtreeHeight > maxDepth - 1) return false;
    return true;
  }, []);

  const onReorder = useCallback(
    (rows: readonly TreeRow<T>[] | undefined, fromIdx: number, toIdx: number, edge: 'top' | 'bottom') => {
      if (!rows) return;
      const dragged = rows[fromIdx];
      const target = rows[toIdx];
      if (!dragged || !target) return;
      if (!canDrop(rows, { fromIdx, toIdx, zone: edge })) return;

      // Bottom-drop on an expanded parent becomes its first child; closed parents stay sibling drops.
      const dropAsFirstChild = edge === 'bottom' && target._hasChildren && target._isExpanded;
      const targetParentId = dropAsFirstChild ? target.id : target.parentId;
      const siblings = rows.filter((row) => row.parentId === targetParentId);
      const anchorOrder = dropAsFirstChild ? Math.min(...siblings.map((sibling) => sibling.displayOrder)) : target.displayOrder;
      const anchorEdge = dropAsFirstChild ? 'top' : edge;
      const newOrder = getRelativeOrder(siblings, anchorOrder, dragged.id, anchorEdge);

      const parentChanged = dragged.parentId !== targetParentId;
      const orderChanged = newOrder !== dragged.displayOrder;
      if (!parentChanged && !orderChanged) return;
      const ops: { displayOrder?: number; parentId?: string | null } = {};
      if (orderChanged) ops.displayOrder = newOrder;
      if (parentChanged) ops.parentId = targetParentId;
      optionsRef.current.mutate(dragged.id, ops);
    },
    [canDrop],
  );

  const onReparent = useCallback(
    (rows: readonly TreeRow<T>[] | undefined, fromIdx: number, toIdx: number) => {
      if (!rows) return;
      const dragged = rows[fromIdx];
      const target = rows[toIdx];
      if (!dragged || !target) return;
      const { mutate, defaultExpanded = false } = optionsRef.current;
      if (dragged.parentId === target.id) return;
      if (!canDrop(rows, { fromIdx, toIdx, zone: 'center' })) return;

      mutate(dragged.id, { parentId: target.id });
      // Auto-expand the new parent so the dropped row is visible.
      setToggledIds((prev) => {
        const isExpanded = defaultExpanded ? !prev.has(target.id) : prev.has(target.id);
        if (isExpanded) return prev;
        const next = new Set(prev);
        if (defaultExpanded) next.delete(target.id);
        else next.add(target.id);
        return next;
      });
    },
    [canDrop],
  );

  const context: TreeContextValue = useMemo(
    () => ({ onToggle, rowHeight: options.rowHeight, maxDepth: options.maxDepth }),
    [onToggle, options.rowHeight, options.maxDepth],
  );

  return {
    /** Bind to your query's `select` option. Stable across renders. */
    buildRows,
    /** Stable across renders. */
    onToggle,
    canDrop,
    onReorder,
    onReparent,
    /** Pass to `<TreeProvider value={tree.context}>`. */
    context,
    /** Same value as `options.rowHeight`, so `<DataTable>` and `<TreeProvider>` share one source. */
    rowHeight: options.rowHeight,
  };
}
