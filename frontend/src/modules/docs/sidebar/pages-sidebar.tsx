import { useInfiniteQuery } from '@tanstack/react-query';
import { useRouterState } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { buildPageNodeTree, computeAncestorIds, PageBranch } from '~/modules/docs/sidebar/page-tree-item';
import { pagesListQueryOptions } from '~/modules/page/query';
import { SidebarMenu, SidebarMenuItem } from '~/modules/ui/sidebar';

interface PagesSidebarProps {
  onClose: () => void;
}

/** Sidebar listing published pages as a hierarchical tree, sorted by displayOrder. */
export function PagesSidebar({ onClose }: PagesSidebarProps) {
  const { t } = useTranslation();
  const { location } = useRouterState();

  const { data: pages } = useInfiniteQuery({
    ...pagesListQueryOptions({ sort: 'displayOrder', order: 'asc' }),
    select: ({ pages }) => pages.flatMap(({ items }) => items).filter((page) => page.status === 'published'),
  });

  // Active page id from URL (e.g. /docs/page/<id>)
  const activePageId = location.pathname.match(/\/docs\/page\/([^/]+)/)?.[1];

  // Tree of pages for nested rendering
  const pageTree = pages ? buildPageNodeTree(pages) : [];

  // Expanded subtree state — additive: ancestors of the active page are seeded on route change,
  // but the user remains free to collapse them afterwards without them snapping back open.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    if (!pages || !activePageId) return;
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
