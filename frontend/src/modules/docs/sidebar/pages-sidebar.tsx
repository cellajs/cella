import { useRouterState } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { buildPageNodeTree, computeAncestorIds, PageBranch } from '~/modules/docs/sidebar/page-tree-item';
import { docPages } from '~/modules/page/content';
import { SidebarMenu, SidebarMenuItem } from '~/modules/ui/sidebar';

interface PagesSidebarProps {
  onClose: () => void;
}

/** Sidebar listing docs pages as a hierarchical tree, sorted by display order. */
export function PagesSidebar({ onClose }: PagesSidebarProps) {
  const { t } = useTranslation();
  const { location } = useRouterState();

  const pages = useMemo(() => docPages.filter((page) => !page.draft && !page.hidden), []);

  // Active page slug from URL (e.g. /docs/page/<slug>, slug may contain slashes)
  const activeMatch = location.pathname.match(/\/docs\/page\/(.+?)\/?$/)?.[1];
  const activePageId = activeMatch ? decodeURIComponent(activeMatch) : undefined;

  // Tree of pages for nested rendering
  const pageTree = buildPageNodeTree(pages);

  // Ancestor chain of the active page: seeds expansion on route change and lets rows
  // know whether the user is viewing one of their subpages.
  const activeAncestorIds = useMemo(() => computeAncestorIds(pages, activePageId), [pages, activePageId]);

  // Effective parent per page id for sibling lookup (orphans count as roots, like buildPageNodeTree)
  const parentById = useMemo(() => {
    const validIds = new Set(pages.map((p) => p.id));
    return new Map(pages.map((p) => [p.id, p.parentId && validIds.has(p.parentId) ? p.parentId : null]));
  }, [pages]);

  // Accordion: expanding an id evicts its siblings (same effective parent) from the set
  const expandExclusive = (next: Set<string>, id: string) => {
    const parent = parentById.get(id) ?? null;
    for (const other of [...next]) if (parentById.get(other) === parent) next.delete(other);
    next.add(id);
  };

  // Ancestors of the active page are seeded on route change (accordion-pruned per level);
  // the user remains free to collapse them afterwards without them snapping back open.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    if (activeAncestorIds.size === 0) return;
    setExpandedIds((prev) => {
      const next = new Set(prev);
      for (const id of activeAncestorIds) expandExclusive(next, id);
      const changed = next.size !== prev.size || [...next].some((id) => !prev.has(id));
      return changed ? next : prev;
    });
  }, [activeAncestorIds]);

  const togglePageExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else expandExclusive(next, id);
      return next;
    });
  };

  return (
    <SidebarMenu className="gap-1 p-0 pt-1">
      {pageTree.length > 0 ? (
        pageTree.map((node) => (
          <PageBranch
            key={node.page.id}
            node={node}
            variant="root"
            activePageId={activePageId}
            activeAncestorIds={activeAncestorIds}
            expandedIds={expandedIds}
            onToggle={togglePageExpanded}
            onClose={onClose}
          />
        ))
      ) : (
        <SidebarMenuItem>
          <span className="px-3 py-2 text-muted-foreground text-sm lowercase">{t('c:docs.no_pages_yet')}</span>
        </SidebarMenuItem>
      )}
    </SidebarMenu>
  );
}
