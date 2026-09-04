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

  const pageTree = useMemo(() => buildPageNodeTree(pages), [pages]);

  // Ancestor chain of the active page: seeds expansion on route change.
  const activeAncestorIds = useMemo(() => computeAncestorIds(pages, activePageId), [pages, activePageId]);

  // Effective parent per page id for sibling lookup (orphans count as roots, like buildPageNodeTree)
  const parentById = useMemo(() => {
    const validIds = new Set(pages.map((p) => p.id));
    return new Map(pages.map((p) => [p.id, p.parentId && validIds.has(p.parentId) ? p.parentId : null]));
  }, [pages]);

  // Accordion: expanding an id collapses its siblings (same effective parent, removed from the set)
  const expandExclusive = (next: Set<string>, id: string) => {
    const parent = parentById.get(id) ?? null;
    for (const other of [...next]) if (parentById.get(other) === parent) next.delete(other);
    next.add(id);
  };

  // Ancestors of the active page are open on first render, so the sheet opens with the tree already expanded
  // and Base UI skips the mount keyframe. Later route changes seed via the effect (accordion-pruned per
  // level); later collapses stick.
  const seedExpanded = () => {
    const next = new Set<string>();
    for (const id of activeAncestorIds) expandExclusive(next, id);
    return next;
  };
  const [expandedIds, setExpandedIds] = useState<Set<string>>(seedExpanded);
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
