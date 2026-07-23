/**
 * Minimal contract a row needs to satisfy to be tree-able. If your entity
 * uses different field names, override the accessors via {@link BuildTreeOptions}.
 */
export interface TreeItem {
  id: string;
  parentId: string | null;
  displayOrder: number;
}

/** A row augmented with tree-display metadata. Produced by {@link buildTree}. */
export type TreeRow<T> = T & {
  _depth: number;
  _hasChildren: boolean;
  /** Number of direct children. Stable across expand/collapse. */
  _childCount: number;
  _isExpanded: boolean;
  /** True when this row is the last child of its parent (or last root). */
  _isLastChild: boolean;
  /**
   * True when this row's immediate parent was the last child of *its* parent.
   * Decides whether ancestor-trunk guide lines should continue through
   * this row in deeper levels. Always false for depth-0 rows.
   */
  _parentIsLastChild: boolean;
  /**
   * Deepest descendant offset from this row (leaf = 0, parent of a leaf = 1, ...).
   * Computed from the full items array, so it stays accurate when descendants
   * are collapsed and not currently rendered.
   */
  _subtreeHeight: number;
};

/** The three field reads the tree builder performs, as functions over a row. */
export interface TreeAccessors<T> {
  getId: (item: T) => string;
  getParentId: (item: T) => string | null;
  getDisplayOrder: (item: T) => number;
}

export interface BuildTreeOptions<T> {
  toggledIds: ReadonlySet<string>;
  /** Baseline expansion state. `true` = all expanded by default. */
  defaultExpanded?: boolean;
  /** Override field accessors if your entity doesn't use the default names. */
  getId?: (item: T) => string;
  getParentId?: (item: T) => string | null;
  getDisplayOrder?: (item: T) => number;
}

/** Field reads used when a row satisfies {@link TreeItem} and supplies no overrides. */
export const treeItemAccessors: TreeAccessors<TreeItem> = {
  getId: (item) => item.id,
  getParentId: (item) => item.parentId,
  getDisplayOrder: (item) => item.displayOrder,
};

/**
 * Build the visible depth-first tree from flat items.
 * Expansion is `defaultExpanded XOR toggledIds.has(id)`.
 *
 * A row satisfying {@link TreeItem} may omit the accessors; any other row shape must supply
 * all three, so a row without the default fields is rejected at the call site.
 */
export function buildTree<T extends TreeItem>(items: T[], opts: BuildTreeOptions<T>): TreeRow<T>[];
export function buildTree<T>(items: T[], opts: BuildTreeOptions<T> & TreeAccessors<T>): TreeRow<T>[];
export function buildTree<T extends TreeItem>(items: T[], opts: BuildTreeOptions<T>): TreeRow<T>[] {
  const getId = opts.getId ?? treeItemAccessors.getId;
  const getParentId = opts.getParentId ?? treeItemAccessors.getParentId;
  const getDisplayOrder = opts.getDisplayOrder ?? treeItemAccessors.getDisplayOrder;
  const defaultExpanded = opts.defaultExpanded ?? false;
  const { toggledIds } = opts;

  // Index children by parentId.
  const childrenMap = new Map<string | null, T[]>();
  for (const item of items) {
    const key = getParentId(item) ?? null;
    const list = childrenMap.get(key);
    if (list) list.push(item);
    else childrenMap.set(key, [item]);
  }

  // Sort siblings by displayOrder.
  for (const siblings of childrenMap.values()) {
    siblings.sort((a, b) => getDisplayOrder(a) - getDisplayOrder(b));
  }

  // Memoized subtree-height computation. Walks the full tree (not just
  // expanded), so the value is stable across expand/collapse and needed for
  // depth-limit drag validation while parts of the tree are hidden.
  const subtreeHeightCache = new Map<string, number>();
  function computeSubtreeHeight(itemId: string): number {
    const cached = subtreeHeightCache.get(itemId);
    if (cached !== undefined) return cached;
    const children = childrenMap.get(itemId);
    if (!children || children.length === 0) {
      subtreeHeightCache.set(itemId, 0);
      return 0;
    }
    let max = 0;
    for (const child of children) {
      const h = computeSubtreeHeight(getId(child));
      if (h > max) max = h;
    }
    const height = max + 1;
    subtreeHeightCache.set(itemId, height);
    return height;
  }

  const result: TreeRow<T>[] = [];

  function walk(parentId: string | null, depth: number, parentIsLastChild: boolean) {
    const children = childrenMap.get(parentId);
    if (!children) return;
    for (let i = 0; i < children.length; i++) {
      const item = children[i];
      const id = getId(item);
      const directChildren = childrenMap.get(id);
      const hasChildren = directChildren !== undefined;
      const isToggled = toggledIds.has(id);
      const isExpanded = hasChildren && (defaultExpanded ? !isToggled : isToggled);
      const isLastChild = i === children.length - 1;
      result.push({
        ...(item as object),
        _depth: depth,
        _hasChildren: hasChildren,
        _childCount: directChildren?.length ?? 0,
        _isExpanded: isExpanded,
        _isLastChild: isLastChild,
        _parentIsLastChild: parentIsLastChild,
        _subtreeHeight: computeSubtreeHeight(id),
      } as TreeRow<T>);
      if (isExpanded) {
        walk(id, depth + 1, isLastChild);
      }
    }
  }

  walk(null, 0, false);
  return result;
}
