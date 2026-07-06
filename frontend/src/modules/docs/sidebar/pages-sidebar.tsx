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

  const pages = useMemo(() => docPages.filter((page) => !page.draft), []);

  // Active page slug from URL (e.g. /docs/page/<slug>, slug may contain slashes)
  const activeMatch = location.pathname.match(/\/docs\/page\/(.+?)\/?$/)?.[1];
  const activePageId = activeMatch ? decodeURIComponent(activeMatch) : undefined;

  // Tree of pages for nested rendering
  const pageTree = buildPageNodeTree(pages);

  // Expanded subtree state — additive: ancestors of the active page are seeded on route change,
  // but the user remains free to collapse them afterwards without them snapping back open.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    if (!activePageId) return;
    const ancestors = computeAncestorIds(pages, activePageId);
    if (ancestors.size === 0) return;
    setExpandedIds((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const id of ancestors) {
        if (!next.has(id)) {
          next.add(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [activePageId, pages]);

  const togglePageExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
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
