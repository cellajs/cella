import { useCallback, useMemo, useState } from 'react';
import { getEdgeOrder, getRelativeOrder } from 'shared/utils/display-order';
import { useLatestRef } from '~/hooks/use-latest-ref';
import { buildTree, type TreeItem, type TreeRow } from '~/modules/common/data-table/tree/build-tree';
import type { TreeContextValue } from '~/modules/common/data-table/tree/tree-context';
import type { ReorderPosition } from '~/modules/common/reorder-handle/reorder-handle';

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

// Rows are rebuilt each render, so their sibling places are computed once per rows array
const siblingPlaces = new WeakMap<readonly TreeItem[], Map<string, ReorderPosition>>();

/** The place of the row at `rowIdx` among its visible siblings. */
export function siblingPosition(rows: readonly TreeItem[], rowIdx: number): ReorderPosition {
  let places = siblingPlaces.get(rows);
  if (!places) {
    places = new Map();
    const byParent = Map.groupBy(rows, (row) => row.parentId);
    for (const siblings of byParent.values()) {
      for (const [index, row] of siblings.entries()) places.set(row.id, { index, total: siblings.length });
    }
    siblingPlaces.set(rows, places);
  }
  return places.get(rows[rowIdx]?.id) ?? { index: 0, total: 1 };
}

const sortedChildren = <T extends TreeItem>(items: readonly T[], parentId: string | null) =>
  items.filter((item) => item.parentId === parentId).toSorted((a, b) => a.displayOrder - b.displayOrder);

/** Owns expansion, drop validation, reordering, and reparenting; pair its context with `TreeProvider` and `ExpandToggleColumn`. */
export function useTreeRows<T extends TreeItem>(options: UseTreeRowsOptions) {
  const [toggledIds, setToggledIds] = useState<Set<string>>(new Set());
  // The handlers below stay stable and read the current options through this ref; render reads `options` itself
  const optionsRef = useLatestRef(options);

  const onToggle = useCallback((id: string) => {
    setToggledIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const buildRows = useCallback(
    (items: T[]): TreeRow<T>[] => buildTree(items, { toggledIds, defaultExpanded: options.defaultExpanded }),
    [toggledIds, options.defaultExpanded],
  );

  const canDrop = useCallback(
    (rows: readonly TreeRow<T>[] | undefined, { fromIdx, toIdx, zone }: CanDropArgs): boolean => {
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
    },
    [optionsRef],
  );

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
    [canDrop, optionsRef],
  );

  // A new parent expands, so the row that moved into it stays visible
  const expand = useCallback(
    (id: string) => {
      const { defaultExpanded = false } = optionsRef.current;
      setToggledIds((prev) => {
        const isExpanded = defaultExpanded ? !prev.has(id) : prev.has(id);
        if (isExpanded) return prev;
        const next = new Set(prev);
        if (defaultExpanded) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [optionsRef],
  );

  const onReparent = useCallback(
    (rows: readonly TreeRow<T>[] | undefined, fromIdx: number, toIdx: number) => {
      if (!rows) return;
      const dragged = rows[fromIdx];
      const target = rows[toIdx];
      if (!dragged || !target) return;
      if (dragged.parentId === target.id) return;
      if (!canDrop(rows, { fromIdx, toIdx, zone: 'center' })) return;

      optionsRef.current.mutate(dragged.id, { parentId: target.id });
      expand(target.id);
    },
    [canDrop, expand, optionsRef],
  );

  /** Moves the row one place among its visible siblings, its subtree along; a reorder grip's ↑/↓. */
  const onStep = useCallback(
    (rows: readonly TreeRow<T>[], rowIdx: number, step: -1 | 1) => {
      const row = rows[rowIdx];
      if (!row) return;
      const siblings = rows.filter((sibling) => sibling.parentId === row.parentId);
      const target = siblings[siblings.indexOf(row) + step];
      if (!target) return;
      const displayOrder = getRelativeOrder(siblings, target.displayOrder, row.id, step < 0 ? 'top' : 'bottom');
      if (displayOrder !== row.displayOrder) optionsRef.current.mutate(row.id, { displayOrder });
    },
    [optionsRef],
  );

  /**
   * A reorder grip's ←/→: outdent (-1) puts the row right after its parent, indent (1) makes it the last child of the
   * sibling above it, within `maxDepth`. `items` is the full list, since a collapsed parent hides its children from `rows`.
   * @returns The row's new place among its siblings, or null when it cannot go there.
   */
  const onShift = useCallback(
    (items: readonly T[], rows: readonly TreeRow<T>[], rowIdx: number, direction: -1 | 1): ReorderPosition | null => {
      const row = rows[rowIdx];
      if (!row) return null;
      const { mutate, maxDepth } = optionsRef.current;

      if (direction === 1) {
        const siblings = sortedChildren(items, row.parentId);
        const parent = siblings[siblings.findIndex((sibling) => sibling.id === row.id) - 1];
        if (!parent) return null;
        if (maxDepth !== undefined && row._depth + 1 + row._subtreeHeight > maxDepth - 1) return null;
        const children = sortedChildren(items, parent.id);
        mutate(row.id, {
          parentId: parent.id,
          displayOrder: getEdgeOrder(
            children.map((child) => child.displayOrder),
            'bottom',
          ),
        });
        expand(parent.id);
        return { index: children.length, total: children.length + 1 };
      }

      const parent = items.find((item) => item.id === row.parentId);
      if (!parent) return null;
      const parentSiblings = sortedChildren(items, parent.parentId);
      mutate(row.id, { parentId: parent.parentId, displayOrder: getRelativeOrder(parentSiblings, parent.displayOrder, row.id, 'bottom') });
      return { index: parentSiblings.indexOf(parent) + 1, total: parentSiblings.length + 1 };
    },
    [expand, optionsRef],
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
    onStep,
    onShift,
    /** Pass to `<TreeProvider value={tree.context}>`. */
    context,
    /** Same value as `options.rowHeight`, so `<DataTable>` and `<TreeProvider>` share one source. */
    rowHeight: options.rowHeight,
  };
}
