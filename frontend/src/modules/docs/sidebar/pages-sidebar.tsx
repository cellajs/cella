import { useMatch } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageBranch, type PageNode } from '~/modules/docs/sidebar/page-branch';
import { type DocPage, useVisibleDocPages } from '~/modules/page/content';
import { SidebarMenu, SidebarMenuItem } from '~/modules/ui/sidebar';

/** Build a hierarchical tree of pages; every level keeps the order of `pages`, which `docPages` sorts by display order. */
function buildPageNodeTree(pages: DocPage[]): PageNode[] {
  const parentById = effectiveParents(pages);
  const byParent = new Map<string | null, DocPage[]>();
  for (const page of pages) {
    const key = parentById.get(page.id) ?? null;
    const siblings = byParent.get(key);
    if (siblings) siblings.push(page);
    else byParent.set(key, [page]);
  }

  const build = (parentId: string | null): PageNode[] => (byParent.get(parentId) ?? []).map((page) => ({ page, children: build(page.id) }));

  return build(null);
}

/** Compute the set of ancestor ids of the given page (excluding the page itself). */
function computeAncestorIds(pages: DocPage[], pageId: string | undefined): Set<string> {
  const ancestors = new Set<string>();
  if (!pageId) return ancestors;
  const byId = new Map(pages.map((page) => [page.id, page]));
  let current = byId.get(pageId);
  while (current?.parentId && !ancestors.has(current.parentId)) {
    ancestors.add(current.parentId);
    current = byId.get(current.parentId);
  }
  return ancestors;
}

type ParentById = Map<string, string | null>;

/** Effective parent per page id, for the tree and for sibling lookup: an orphan (parent outside the visible set) counts as a root. */
function effectiveParents(pages: DocPage[]): ParentById {
  const pageIds = new Set(pages.map((page) => page.id));
  return new Map(pages.map((page) => [page.id, page.parentId && pageIds.has(page.parentId) ? page.parentId : null]));
}

/** Accordion: expanding an id collapses its siblings (same effective parent, removed from the set). */
function expandExclusive(next: Set<string>, id: string, parentById: ParentById) {
  const parent = parentById.get(id) ?? null;
  for (const other of [...next]) if (parentById.get(other) === parent) next.delete(other);
  next.add(id);
}

/** The set with the page's ancestors opened, each collapsing its siblings; the same set when nothing changes. */
function expandAncestors(expandedIds: Set<string>, pageId: string | undefined, pages: DocPage[]) {
  const parentById = effectiveParents(pages);
  const next = new Set(expandedIds);
  for (const id of computeAncestorIds(pages, pageId)) expandExclusive(next, id, parentById);
  const changed = next.size !== expandedIds.size || [...next].some((id) => !expandedIds.has(id));
  return changed ? next : expandedIds;
}

/** Sidebar listing docs pages as a hierarchical tree, sorted by display order. */
export function PagesSidebar() {
  const { t } = useTranslation();
  const pages = useVisibleDocPages();
  const pageTree = buildPageNodeTree(pages);
  // The docs page's slug, which may contain slashes (sync-engine/cdc); undefined off a docs page
  const activePageId = useMatch({ from: '/_public/docs/page/$', shouldThrow: false, select: (match) => match.params._splat }) || undefined;

  // The active page's ancestors are open from the first render, so the sheet opens expanded and Base UI skips the mount keyframe
  const [expandedIds, setExpandedIds] = useState(() => expandAncestors(new Set(), activePageId, pages));
  const [prevPageId, setPrevPageId] = useState(activePageId);
  // A route change opens the new page's ancestors in the same render; a collapse sticks until the next one
  if (prevPageId !== activePageId) {
    setPrevPageId(activePageId);
    setExpandedIds(expandAncestors(expandedIds, activePageId, pages));
  }

  const togglePageExpanded = (id: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else expandExclusive(next, id, effectiveParents(pages));
      return next;
    });

  return (
    <SidebarMenu className="no-focus-ring:gap-0 gap-1 p-0 pt-1">
      {pageTree.length > 0 ? (
        pageTree.map((node) => (
          <PageBranch key={node.page.id} variant="root" {...{ node, activePageId, expandedIds }} onToggle={togglePageExpanded} />
        ))
      ) : (
        <SidebarMenuItem>
          <span className="text-faint-foreground px-3 py-2 text-sm">{t('c:no_resource_yet', { resource: t('c:page_other') })}</span>
        </SidebarMenuItem>
      )}
    </SidebarMenu>
  );
}
