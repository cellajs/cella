import { useMatch } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { buildPageNodeTree, computeAncestorIds, PageBranch } from '~/modules/docs/sidebar/page-branch';
import { visibleDocPages } from '~/modules/page/content';
import { SidebarMenu, SidebarMenuItem } from '~/modules/ui/sidebar';

const pageTree = buildPageNodeTree(visibleDocPages);

// Effective parent per page id for sibling lookup (orphans count as roots, like buildPageNodeTree)
const pageIds = new Set(visibleDocPages.map((page) => page.id));
const parentById = new Map(visibleDocPages.map((page) => [page.id, page.parentId && pageIds.has(page.parentId) ? page.parentId : null]));

/** Accordion: expanding an id collapses its siblings (same effective parent, removed from the set). */
function expandExclusive(next: Set<string>, id: string) {
  const parent = parentById.get(id) ?? null;
  for (const other of [...next]) if (parentById.get(other) === parent) next.delete(other);
  next.add(id);
}

/** The set with the page's ancestors opened, each collapsing its siblings; the same set when nothing changes. */
function expandAncestors(expandedIds: Set<string>, pageId: string | undefined) {
  const next = new Set(expandedIds);
  for (const id of computeAncestorIds(visibleDocPages, pageId)) expandExclusive(next, id);
  const changed = next.size !== expandedIds.size || [...next].some((id) => !expandedIds.has(id));
  return changed ? next : expandedIds;
}

/** Sidebar listing docs pages as a hierarchical tree, sorted by display order. */
export function PagesSidebar() {
  const { t } = useTranslation();
  // The docs page's slug, which may contain slashes (sync-engine/cdc); undefined off a docs page
  const activePageId = useMatch({ from: '/_public/_content/docs/page/$', shouldThrow: false, select: (match) => match.params._splat }) || undefined;

  // The active page's ancestors are open from the first render, so the sheet opens expanded and Base UI skips the mount keyframe
  const [expandedIds, setExpandedIds] = useState(() => expandAncestors(new Set(), activePageId));
  const [prevPageId, setPrevPageId] = useState(activePageId);
  // A route change opens the new page's ancestors in the same render; a collapse sticks until the next one
  if (prevPageId !== activePageId) {
    setPrevPageId(activePageId);
    setExpandedIds(expandAncestors(expandedIds, activePageId));
  }

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
          />
        ))
      ) : (
        <SidebarMenuItem>
          <span className="px-3 py-2 text-faint-foreground text-sm">{t('c:docs.no_pages_yet')}</span>
        </SidebarMenuItem>
      )}
    </SidebarMenu>
  );
}
