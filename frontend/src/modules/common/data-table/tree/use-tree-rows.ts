import { useCallback, useMemo, useRef, useState } from 'react';
import { getRelativeOrder } from 'shared/display-order';
import { type BuildTreeOptions, buildTree, type TreeItem, type TreeRow } from './build-tree';
import type { TreeContextValue } from './tree-context';

/** Persists a tree-shape change to the backing store. Wire to your mutation. */
export type TreeMutate = (id: string, ops: { displayOrder?: number; parentId?: string | null }) => void;

export interface UseTreeRowsOptions<T> {
  /** Initial expansion baseline. `true` = all expanded, `false` = all collapsed. */
  defaultExpanded?: boolean;
  /** Pixel height of each row. Forwarded to `TreeProvider` for SVG layout. */
  rowHeight: number;
  /** Maximum allowed nesting depth (inclusive). Drives drop validation + visuals. */
  maxDepth?: number;
  /** Persists `displayOrder` / `parentId` after a reorder or reparent. */
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

const defaultGetId = <T>(item: T) => (item as unknown as TreeItem).id;
const defaultGetParentId = <T>(item: T) => (item as unknown as TreeItem).parentId;
const defaultGetDisplayOrder = <T>(item: T) => (item as unknown as TreeItem).displayOrder;

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

/**
 * Owns expansion state and provides reorder/reparent/canDrop handlers for a
 * tree-style `<DataTable>`. Pair with {@link TreeProvider} and
 * {@link ExpandToggleColumn} so consumers don't have to wire toggle state,
 * drop validation, and displayOrder math themselves.
 *
 * Usage:
 * ```tsx
 * const tree = useTreeRows<Page>({ rowHeight: 60, maxDepth: 3, mutate });
 * const { data: rows } = useInfiniteQuery({ ...opts, select: tree.buildRows });
 * return (
 *   <TreeProvider value={tree.context}>
 *     <DataTable
 *       rows={rows}
 *       rowHeight={tree.rowHeight}
 *       canDropRow={(args) => tree.canDrop(rows, args)}
 *       onRowReorder={(f, t, e) => tree.onReorder(rows, f, t, e)}
 *       onRowReparent={(f, t) => tree.onReparent(rows, f, t)}
 *     />
 *   </TreeProvider>
 * );
 * ```
 */
export function useTreeRows<T>(opts: UseTreeRowsOptions<T>) {
  const [toggledIds, setToggledIds] = useState<Set<string>>(new Set());
  // Latest opts behind a ref so the callbacks below stay stable while still
  // reading current accessors / mutate / maxDepth.
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

  // Stable: builds tree rows from a flat list. Pass to a query `select`.
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
      const getId = o.getId ?? defaultGetId;
      const getParentId = o.getParentId ?? defaultGetParentId;

      // Cycle prevention: target must not be the dragged row or any descendant.
      const byId = new Map(rows.map((r) => [getId(r), r] as const));
      if (isSelfOrDescendantOf(getId(dragged), getId(target), byId, getParentId)) return false;

      // 'center' lands as a child; 'bottom' on an expanded parent lands as
      // first child; otherwise the target's depth is reused.
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
      const getId = o.getId ?? defaultGetId;
      const getParentId = o.getParentId ?? defaultGetParentId;
      const getDisplayOrder = o.getDisplayOrder ?? defaultGetDisplayOrder;

      // Bottom-drop on an expanded parent reads visually as "land just under
      // it" = first child of that parent. Closed parents stay sibling drops.
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
      const getId = o.getId ?? defaultGetId;
      const getParentId = o.getParentId ?? defaultGetParentId;
      if (getParentId(dragged) === getId(target)) return;
      if (!canDrop(rows, { fromIdx, toIdx, zone: 'center' })) return;

      o.mutate(getId(dragged), { parentId: getId(target) });
      // Auto-expand the new parent so the dropped row is visible. Flip the
      // override state to match the `defaultExpanded` baseline.
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
    /** Drop validator; pass current rows + drop args. */
    canDrop,
    /** Top/bottom drop handler; pass current rows + drag info + edge. */
    onReorder,
    /** Center drop handler; pass current rows + drag info. */
    onReparent,
    /** Pass to `<TreeProvider value={tree.context}>`. */
    context,
    /** Convenience re-export of `opts.rowHeight` so `<DataTable>` and `<TreeProvider>` share one source. */
    rowHeight: opts.rowHeight,
  };
}
