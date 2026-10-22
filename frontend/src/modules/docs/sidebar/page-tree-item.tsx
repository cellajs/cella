import { Link } from '@tanstack/react-router';
import { ChevronDownIcon } from 'lucide-react';
import { useId } from 'react';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { getSection, scrollToSectionById } from '~/hooks/use-scroll-spy-store';
import { sheeter } from '~/modules/common/sheeter/use-sheeter';
import { collapsiblePanelClass } from '~/modules/docs/collapsible-panel';
import { ActiveIndicator } from '~/modules/docs/sidebar/active-indicator';
import { closeSidebarSheetAndNavigate, docsSidebarSheetId } from '~/modules/docs/sidebar/close-sidebar-sheet';
import { sidebarLeafClass } from '~/modules/docs/sidebar/sidebar-hash-item';
import { type DocPage, pageSectionId } from '~/modules/page/content';
import { Button, buttonVariants } from '~/modules/ui/button';
import { Collapsible, CollapsibleContent } from '~/modules/ui/collapsible';
import { SidebarMenuItem } from '~/modules/ui/sidebar';
import { cn } from '~/utils/cn';
import { isModifiedClick } from '~/utils/is-modified-click';

export type PageNode = { page: DocPage; children: PageNode[] };

type PageBranchProps = {
  node: PageNode;
  variant: 'root' | 'parent';
  activePageId: string | undefined;
  expandedIds: ReadonlySet<string>;
  onToggle: (id: string) => void;
};

/** Tier 0 (root) and tier 1 (parent) page rows. Both are collapsible; only visuals differ. */
export function PageBranch({ node, variant, activePageId, expandedIds, onToggle }: PageBranchProps) {
  const { page, children } = node;
  const hasChildren = children.length > 0;
  const isExpanded = expandedIds.has(page.id);
  const isActive = activePageId === page.id;
  const expanderOnly = page.renderMode === 'nodeOnly' && hasChildren;
  const isRoot = variant === 'root';
  // Sheet-mode threshold (below `md`): the indicator moves as in the tag groups
  const isMobile = useBreakpointBelow('md', false);
  const layoutId = useId();
  const activeChildIndex = isRoot ? -1 : children.findIndex((c) => c.page.id === activePageId);

  return (
    <Collapsible
      open={hasChildren && isExpanded}
      render={<SidebarMenuItem className={cn('relative', isRoot ? 'group/page-root' : 'group/page-parent')} data-expanded={isExpanded} />}
    >
      {/* Vertical guideline (parent tier only), reads expanded state from the row scope */}
      {!isRoot && hasChildren && (
        <div className="pointer-events-none absolute top-8 bottom-2 left-2.5 hidden w-px bg-muted-foreground/30 group-data-[expanded=true]/page-parent:block" />
      )}

      {/* Sticky tier-1 row: pins just below the scroller top while its subtree scrolls. The wrapper holds the opaque bg,
            so the ghost hover (translucent in dark mode) still hides the rows passing underneath. */}
      <div className={isRoot ? 'sticky top-2 z-10 bg-card' : 'contents'}>
        <Link
          to="/docs/page/$"
          params={{ _splat: page.id }}
          preload={expanderOnly ? false : 'intent'}
          draggable={false}
          data-active={isActive}
          data-expanded={isExpanded}
          className={cn(
            buttonVariants({ variant: 'ghost' }),
            'group w-full justify-start gap-2 pl-5 text-left lowercase',
            isRoot
              ? 'px-3 font-medium data-[active=true]:bg-accent data-[active=true]:font-semibold'
              : 'focus-inset h-8 font-normal opacity-80 data-[active=true]:bg-accent data-[active=true]:font-medium data-[active=true]:opacity-100 data-[expanded=true]:opacity-100',
          )}
          onClick={(e) => {
            if (isModifiedClick(e)) return;
            if (expanderOnly) {
              e.preventDefault();
              onToggle(page.id);
              return;
            }
            // Collapsing is a re-click at the top of the page you are on. Further down that page the click scrolls back up,
            // and from another page it navigates here; both leave the subtree open.
            if (hasChildren && isExpanded && isActive) {
              e.preventDefault();
              if (getSection() === pageSectionId) return onToggle(page.id);
              scrollToSectionById(pageSectionId);
              sheeter.getState().remove(docsSidebarSheetId);
              return;
            }
            if (hasChildren && !isExpanded) onToggle(page.id);
            // On mobile the sheet closes only on leaf navigation, so children revealed by an expand stay visible
            if (!hasChildren) closeSidebarSheetAndNavigate(e);
          }}
        >
          {/* Leading dot (parent tier only) */}
          {!isRoot && (
            <div className="absolute left-[0.53rem] size-1 rounded-full bg-muted-foreground/30 group-data-[expanded=true]/page-parent:bg-muted-foreground/60" />
          )}
          <span className="truncate">{page.name}</span>
          {hasChildren && (
            <ChevronDownIcon
              className={cn(
                'ml-auto size-4 shrink-0 opacity-40 transition-transform duration-200',
                isRoot ? 'group-data-[expanded=true]/page-root:rotate-180' : 'group-data-[expanded=true]/page-parent:rotate-180',
              )}
            />
          )}
        </Link>
      </div>

      {hasChildren && (
        <CollapsibleContent className={collapsiblePanelClass}>
          {isRoot ? (
            // A <ul> keeps the nested SidebarMenuItem <li> rows off this row's own <li> (invalid HTML)
            <ul className="flex list-none flex-col gap-1 py-1">
              {children.map((child) => (
                <PageBranch
                  key={child.page.id}
                  node={child}
                  variant="parent"
                  activePageId={activePageId}
                  expandedIds={expandedIds}
                  onToggle={onToggle}
                />
              ))}
            </ul>
          ) : (
            <div className="relative flex flex-col px-0 py-0.5">
              <ActiveIndicator activeIndex={activeChildIndex} layoutId={layoutId} isMobile={isMobile} />
              {children.map((child) => (
                <PageLeaf key={child.page.id} page={child.page} isActive={child.page.id === activePageId} />
              ))}
            </div>
          )}
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}

/** Tier 2: Leaf page row. */
function PageLeaf({ page, isActive }: { page: DocPage; isActive: boolean }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn(sidebarLeafClass, 'justify-start data-[active=true]:bg-accent')}
      render={
        <Link
          to="/docs/page/$"
          params={{ _splat: page.id }}
          preload="intent"
          draggable={false}
          data-active={isActive}
          onClick={closeSidebarSheetAndNavigate}
        />
      }
    >
      <span className="truncate text-sm">{page.name}</span>
    </Button>
  );
}

/** Build a hierarchical tree of pages; every level keeps the order of `pages`, which `docPages` sorts by display order. */
export function buildPageNodeTree(pages: DocPage[]): PageNode[] {
  const validIds = new Set(pages.map((p) => p.id));
  const byParent = new Map<string | null, DocPage[]>();
  for (const p of pages) {
    // Treat parentless pages (parent missing from visible set) as roots
    const key = p.parentId && validIds.has(p.parentId) ? p.parentId : null;
    const list = byParent.get(key);
    if (list) list.push(p);
    else byParent.set(key, [p]);
  }

  const build = (parentId: string | null): PageNode[] => (byParent.get(parentId) ?? []).map((page) => ({ page, children: build(page.id) }));

  return build(null);
}

/** Compute the set of ancestor ids of the given page (excluding the page itself). */
export function computeAncestorIds(pages: DocPage[], pageId: string | undefined): Set<string> {
  const ancestors = new Set<string>();
  if (!pageId) return ancestors;
  const byId = new Map(pages.map((p) => [p.id, p]));
  let current = byId.get(pageId);
  while (current?.parentId && !ancestors.has(current.parentId)) {
    ancestors.add(current.parentId);
    current = byId.get(current.parentId);
  }
  return ancestors;
}
