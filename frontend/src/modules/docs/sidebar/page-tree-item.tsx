import { Link } from '@tanstack/react-router';
import { ChevronDownIcon } from 'lucide-react';
import { useId } from 'react';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import type { DocPage } from '~/modules/page/content';
import { Button, buttonVariants } from '~/modules/ui/button';
import { Collapsible, CollapsibleContent } from '~/modules/ui/collapsible';
import { SidebarMenuItem } from '~/modules/ui/sidebar';
import { cn } from '~/utils/cn';
import { useSheeter } from '../../common/sheeter/use-sheeter';
import { ActiveIndicator } from './active-indicator';

export type PageNode = {
  page: DocPage;
  children: PageNode[];
};

type PageBranchProps = {
  node: PageNode;
  variant: 'root' | 'parent';
  activePageId: string | undefined;
  expandedIds: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onClose: () => void;
};

/** Tier 0 (root) and tier 1 (parent) page rows. Both are collapsible; only visuals differ. */
export function PageBranch({ node, variant, activePageId, expandedIds, onToggle, onClose }: PageBranchProps) {
  const { page, children } = node;
  const hasChildren = children.length > 0;
  const isExpanded = expandedIds.has(page.id);
  const isActive = activePageId === page.id;
  const expanderOnly = page.renderMode === 'nodeOnly' && hasChildren;
  const isRoot = variant === 'root';
  const isMobile = useBreakpointBelow('sm', false);
  const layoutId = useId();
  const activeChildIndex = isRoot ? -1 : children.findIndex((c) => c.page.id === activePageId);

  return (
    <Collapsible open={hasChildren && isExpanded}>
      <SidebarMenuItem
        className={cn('relative', isRoot ? 'group/page-root' : 'group/page-parent')}
        data-expanded={isExpanded}
      >
        {/* Vertical guideline (parent tier only) — reads expanded state from the row scope */}
        {!isRoot && hasChildren && (
          <div className="pointer-events-none absolute top-8 bottom-2 left-2.5 hidden w-px bg-muted-foreground/30 group-data-[expanded=true]/page-parent:block" />
        )}

        <Link
          to="/docs/page/$"
          params={{ _splat: page.id }}
          draggable={false}
          data-active={isActive}
          data-expanded={isExpanded}
          className={cn(
            buttonVariants({ variant: 'ghost' }),
            'group h-8 w-full justify-start gap-2 pl-5 text-left lowercase',
            isRoot
              ? 'px-3 font-medium data-[active=true]:bg-accent'
              : 'font-normal opacity-80 data-[active=true]:bg-accent data-[active=true]:opacity-100 data-[expanded=true]:opacity-100',
          )}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey) return;
            if (expanderOnly) {
              e.preventDefault();
              onToggle(page.id);
              return;
            }
            if (hasChildren && !isExpanded) onToggle(page.id);
            onClose();
          }}
        >
          {/* Leading dot (parent tier only) — reads expanded state from the row scope */}
          {!isRoot && (
            <div className="absolute left-[0.53rem] h-1 w-1 rounded-full bg-muted-foreground/30 group-data-[expanded=true]/page-parent:bg-muted-foreground/60" />
          )}
          <span className="truncate">{page.name}</span>
          {hasChildren && (
            <ChevronDownIcon
              className={cn(
                'ml-auto size-4 shrink-0 opacity-40 transition-transform duration-200',
                isRoot
                  ? 'group-data-[expanded=true]/page-root:rotate-180'
                  : 'group-data-[expanded=true]/page-parent:rotate-180',
              )}
              onClick={(e) => {
                if (expanderOnly) return;
                e.preventDefault();
                e.stopPropagation();
                onToggle(page.id);
              }}
            />
          )}
        </Link>

        {hasChildren && (
          <CollapsibleContent className="overflow-hidden data-closed:animate-collapsible-up data-open:animate-collapsible-down">
            {isRoot ? (
              // A <ul> so the nested parent-tier rows (each a SidebarMenuItem <li>)
              // aren't direct <li> children of this row's <li> (invalid HTML).
              <ul className="flex list-none flex-col gap-1 py-1">
                {children.map((child) => (
                  <PageBranch
                    key={child.page.id}
                    node={child}
                    variant="parent"
                    activePageId={activePageId}
                    expandedIds={expandedIds}
                    onToggle={onToggle}
                    onClose={onClose}
                  />
                ))}
              </ul>
            ) : (
              <div className="relative flex flex-col px-0 py-0.5">
                <ActiveIndicator activeIndex={activeChildIndex} layoutId={layoutId} isMobile={isMobile} />
                {children.map((child) => (
                  <PageLeaf
                    key={child.page.id}
                    page={child.page}
                    isActive={child.page.id === activePageId}
                    onClose={onClose}
                  />
                ))}
              </div>
            )}
          </CollapsibleContent>
        )}
      </SidebarMenuItem>
    </Collapsible>
  );
}

/** Tier 2: Leaf page row (mirrors SchemaItem / OperationItem). */
function PageLeaf({ page, isActive, onClose }: { page: DocPage; isActive: boolean; onClose: () => void }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn(
        'h-8 w-full justify-start gap-2 pl-5 text-left font-normal text-sm opacity-70 hover:bg-accent/50',
        'data-[active=true]:bg-accent data-[active=true]:opacity-100',
      )}
      render={
        <Link
          to="/docs/page/$"
          params={{ _splat: page.id }}
          draggable={false}
          data-active={isActive}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey) return;
            useSheeter.getState().remove('docs-sidebar');
            onClose();
          }}
        />
      }
    >
      <span className="truncate text-sm">{page.name}</span>
    </Button>
  );
}

/** Build a hierarchical tree of pages, sorted by displayOrder at every level. */
export function buildPageNodeTree(pages: DocPage[]): PageNode[] {
  const validIds = new Set(pages.map((p) => p.id));
  const byParent = new Map<string | null, DocPage[]>();
  for (const p of pages) {
    // Treat orphans (parent missing from visible set) as roots
    const key = p.parentId && validIds.has(p.parentId) ? p.parentId : null;
    const list = byParent.get(key);
    if (list) list.push(p);
    else byParent.set(key, [p]);
  }
  for (const arr of byParent.values()) arr.sort((a, b) => a.displayOrder - b.displayOrder);

  const build = (parentId: string | null): PageNode[] =>
    (byParent.get(parentId) ?? []).map((page) => ({ page, children: build(page.id) }));

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
