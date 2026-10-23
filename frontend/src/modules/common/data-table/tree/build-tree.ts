/** Minimal row contract for tree building. */
export interface TreeItem {
  id: string;
  parentId: string | null;
  displayOrder: number;
}

export type TreeRow<T> = T & {
  _depth: number;
  _hasChildren: boolean;
  /** Number of direct children. Stable across expand/collapse. */
  _childCount: number;
  _isExpanded: boolean;
  /** True when this row is the last child of its parent, or the last root row. */
  _isLastChild: boolean;
  /** True when the immediate parent was the last child of its own parent; always false at depth 0. */
  _parentIsLastChild: boolean;
  /** Deepest descendant offset (leaf = 0), computed from all items so collapsed descendants still count. */
  _subtreeHeight: number;
};

interface BuildTreeOptions {
  toggledIds: ReadonlySet<string>;
  /** Baseline expansion state. `true` = all expanded by default. */
  defaultExpanded?: boolean;
}

/** Builds the visible depth-first rows; expansion is `defaultExpanded XOR toggledIds.has(id)`. */
export function buildTree<T extends TreeItem>(items: T[], { toggledIds, defaultExpanded = false }: BuildTreeOptions): TreeRow<T>[] {
  const childrenMap = new Map<string | null, T[]>();
  for (const item of items) {
    const siblings = childrenMap.get(item.parentId);
    if (siblings) siblings.push(item);
    else childrenMap.set(item.parentId, [item]);
  }

  for (const siblings of childrenMap.values()) {
    siblings.sort((a, b) => a.displayOrder - b.displayOrder);
  }

  // Walks the full tree, so heights stay valid while descendants are collapsed.
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
      const childHeight = computeSubtreeHeight(child.id);
      if (childHeight > max) max = childHeight;
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
      const { id } = item;
      const directChildren = childrenMap.get(id);
      const hasChildren = directChildren !== undefined;
      const isToggled = toggledIds.has(id);
      const isExpanded = hasChildren && (defaultExpanded ? !isToggled : isToggled);
      const isLastChild = i === children.length - 1;
      result.push({
        ...item,
        _depth: depth,
        _hasChildren: hasChildren,
        _childCount: directChildren?.length ?? 0,
        _isExpanded: isExpanded,
        _isLastChild: isLastChild,
        _parentIsLastChild: parentIsLastChild,
        _subtreeHeight: computeSubtreeHeight(id),
      });
      if (isExpanded) {
        walk(id, depth + 1, isLastChild);
      }
    }
  }

  walk(null, 0, false);
  return result;
}
