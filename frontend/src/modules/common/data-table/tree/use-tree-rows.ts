import { useCallback, useMemo, useRef, useState } from 'react';
import { getRelativeOrder } from 'shared/utils/display-order';
import { type BuildTreeOptions, buildTree, type TreeItem, type TreeRow, treeItemAccessors } from './build-tree';
import type { TreeContextValue } from './tree-context';

export type TreeMutate = (id: string, ops: { displayOrder?: number; parentId?: string | null }) => void;

export interface UseTreeRowsOptions<T> {
  /** Initial expansion baseline. `true` = all expanded, `false` = all collapsed. */
  defaultExpanded?: boolean;
  /** Pixel height of each row, forwarded to `TreeProvider`. */
  rowHeight: number;
  /** Maximum allowed nesting depth, inclusive. */
  maxDepth?: number;
  mutate: TreeMutate;
  /** Optional accessors for entities that don't use the default field names. */
  getId?: BuildTreeOptions<T>['getId'];
  getParentId?: BuildTreeOptions<T>['getParentId'];
  getDisplayOrder?: BuildTreeOptions<T>['getDisplayOrder'];
}

export type DropZone = 'top' | 'bottom' | 'center';

interface CanDropArgs {
  fromIdx: number;
  toIdx: number;
  zone: DropZone;
}

function isSelfOrDescendantOf<T>(
  rootId: string,
  candidateId: string,
  byId: Map<string, TreeRow<T>>,
  getParentId: (i: TreeRow<T>) => string | null,
): boolean {
  if (candidateId === rootId) return true;
  let current = byId.get(candidateId);
  while (current) {
    const pid = getParentId(current);
    if (pid === rootId) return true;
    if (pid == null) return false;
    current = byId.get(pid);
  }
  return false;
}

/** Owns expansion, drop validation, reordering, and reparenting; pair its context with `TreeProvider` and `ExpandToggleColumn`. */
export function useTreeRows<T extends TreeItem>(opts: UseTreeRowsOptions<T>) {
  const [toggledIds, setToggledIds] = useState<Set<string>>(new Set());
  // A ref keeps the callbacks below stable while they read the current opts.
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const onToggle = useCallback((id: string) => {
    setToggledIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const buildRows = useCallback(
    (items: T[]): TreeRow<T>[] => {
      const o = optsRef.current;
      return buildTree(items, {
        toggledIds,
        defaultExpanded: o.defaultExpanded,
        getId: o.getId,
        getParentId: o.getParentId,
        getDisplayOrder: o.getDisplayOrder,
      });
    },
    [toggledIds],
  );

  const canDrop = useCallback(
    (rows: readonly TreeRow<T>[] | undefined, { fromIdx, toIdx, zone }: CanDropArgs): boolean => {
      if (!rows) return false;
      const dragged = rows[fromIdx];
      const target = rows[toIdx];
      if (!dragged || !target) return false;
      const o = optsRef.current;
      const getId = o.getId ?? treeItemAccessors.getId;
      const getParentId = o.getParentId ?? treeItemAccessors.getParentId;

      // Cycle prevention: target must not be the dragged row or any descendant.
      const byId = new Map(rows.map((r) => [getId(r), r] as const));
      if (isSelfOrDescendantOf(getId(dragged), getId(target), byId, getParentId)) return false;

      // 'center' lands as a child, as does 'bottom' on an expanded parent; otherwise the target's depth is reused.
      const landsAsChild = zone === 'center' || (zone === 'bottom' && target._hasChildren && target._isExpanded);
      const targetDepth = landsAsChild ? target._depth + 1 : target._depth;
      if (o.maxDepth !== undefined && targetDepth + dragged._subtreeHeight > o.maxDepth - 1) return false;
      return true;
    },
    [],
  );

  const onReorder = useCallback(
    (rows: readonly TreeRow<T>[] | undefined, fromIdx: number, toIdx: number, edge: 'top' | 'bottom') => {
      if (!rows) return;
      const dragged = rows[fromIdx];
      const target = rows[toIdx];
      if (!dragged || !target) return;
      if (!canDrop(rows, { fromIdx, toIdx, zone: edge })) return;
      const o = optsRef.current;
      const getId = o.getId ?? treeItemAccessors.getId;
      const getParentId = o.getParentId ?? treeItemAccessors.getParentId;
      const getDisplayOrder = o.getDisplayOrder ?? treeItemAccessors.getDisplayOrder;

      // Bottom-drop on an expanded parent lands as its first child; closed parents stay sibling drops.
      const dropAsFirstChild = edge === 'bottom' && target._hasChildren && target._isExpanded;
      const targetParentId = dropAsFirstChild ? getId(target) : (getParentId(target) ?? null);
      const siblings = rows.filter((r) => (getParentId(r) ?? null) === targetParentId);
      // `getRelativeOrder` only needs `{ id, displayOrder }` per item.
      const siblingItems = siblings.map((s) => ({ id: getId(s), displayOrder: getDisplayOrder(s) }));
      const anchorOrder = dropAsFirstChild
        ? Math.min(...siblings.map((s) => getDisplayOrder(s)))
        : getDisplayOrder(target);
      const anchorEdge = dropAsFirstChild ? 'top' : edge;
      const newOrder = getRelativeOrder(siblingItems, anchorOrder, getId(dragged), anchorEdge);

      const parentChanged = (getParentId(dragged) ?? null) !== targetParentId;
      const orderChanged = newOrder !== getDisplayOrder(dragged);
      if (!parentChanged && !orderChanged) return;
      const ops: { displayOrder?: number; parentId?: string | null } = {};
      if (orderChanged) ops.displayOrder = newOrder;
      if (parentChanged) ops.parentId = targetParentId;
      o.mutate(getId(dragged), ops);
    },
    [canDrop],
  );

  const onReparent = useCallback(
    (rows: readonly TreeRow<T>[] | undefined, fromIdx: number, toIdx: number) => {
      if (!rows) return;
      const dragged = rows[fromIdx];
      const target = rows[toIdx];
      if (!dragged || !target) return;
      const o = optsRef.current;
      const getId = o.getId ?? treeItemAccessors.getId;
      const getParentId = o.getParentId ?? treeItemAccessors.getParentId;
      if (getParentId(dragged) === getId(target)) return;
      if (!canDrop(rows, { fromIdx, toIdx, zone: 'center' })) return;

      o.mutate(getId(dragged), { parentId: getId(target) });
      // Auto-expand the new parent so the dropped row is visible.
      setToggledIds((prev) => {
        const expanded = o.defaultExpanded ?? false;
        const tid = getId(target);
        const isExpanded = expanded ? !prev.has(tid) : prev.has(tid);
        if (isExpanded) return prev;
        const next = new Set(prev);
        if (expanded) next.delete(tid);
        else next.add(tid);
        return next;
      });
    },
    [canDrop],
  );

  const context: TreeContextValue = useMemo(
    () => ({ onToggle, rowHeight: opts.rowHeight, maxDepth: opts.maxDepth }),
    [onToggle, opts.rowHeight, opts.maxDepth],
  );

  return {
    /** Bind to your query's `select` option. Stable across renders. */
    buildRows,
    /** Toggle a row by id. Stable across renders. */
    onToggle,
    canDrop,
    onReorder,
    onReparent,
    /** Pass to `<TreeProvider value={tree.context}>`. */
    context,
    /** Same value as `opts.rowHeight`, so `<DataTable>` and `<TreeProvider>` share one source. */
    rowHeight: opts.rowHeight,
  };
}
