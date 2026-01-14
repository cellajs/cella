import { useSuspenseQuery } from '@tanstack/react-query';
import { Link, useLocation, useSearch } from '@tanstack/react-router';
import { ChevronDownIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { memo, useMemo, useRef } from 'react';
import { scrollToSectionById } from '~/hooks/scroll-spy-store';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { operationsQueryOptions, tagsQueryOptions } from '~/modules/docs/query';
import type { GenOperationSummary, GenTagSummary } from '~/modules/docs/types';
import { Badge } from '~/modules/ui/badge';
import { buttonVariants } from '~/modules/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '~/modules/ui/collapsible';
import { SidebarMenu, SidebarMenuItem } from '~/modules/ui/sidebar';
import { cn } from '~/utils/cn';
import { nanoid } from '~/utils/nanoid';
import { useSheeter } from '../../common/sheeter/use-sheeter';
import { getMethodColor } from '../helpers/get-method-color';

type OperationItemProps = {
  operation: GenOperationSummary;
  layoutId: string;
  isMobile: boolean;
};

/** Individual operation item - subscribes to location independently to minimize re-renders */
const OperationItem = memo(({ operation, layoutId, isMobile }: OperationItemProps) => {
  const { hash } = useLocation();
  const isActive = hash === operation.hash;

  return (
    <div className="relative group/operation" data-active={isActive}>
      {isActive && (
        <motion.span
          layoutId={layoutId}
          transition={{ type: 'spring', stiffness: 300, damping: 30, mass: 0.8 }}
          className="w-[0.20rem] bg-primary rounded-full absolute left-2 ml-px top-2 bottom-2"
        />
      )}
      <Link
        to="/docs/operations"
        hash={operation.hash}
        replace
        draggable="false"
        className={cn(
          buttonVariants({ variant: 'ghost', size: 'sm' }),
          'hover:bg-accent/50 w-full justify-between text-left pl-5 group font-normal opacity-70 text-sm h-8 gap-2',
          'group-data-[active=true]/operation:opacity-100',
        )}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey) return;
          e.preventDefault();
          scrollToSectionById(operation.hash);
          isMobile && useSheeter.getState().remove();
        }}
      >
        <span className="truncate flex-1 text-[13px] lowercase">{operation.summary || operation.id}</span>
        <Badge
          variant="secondary"
          className={`text-[11px] p-0 shrink-0 sm:opacity-70 group-hover:opacity-100 uppercase bg-transparent shadow-none ${getMethodColor(operation.method)}`}
        >
          {operation.method}
        </Badge>
      </Link>
    </div>
  );
});

type TagItemProps = {
  tag: GenTagSummary;
  operations: GenOperationSummary[];
  isExpanded: boolean;
  layoutId: string;
  isMobile: boolean;
};

/** Individual tag collapsible item - subscribes to location independently */
const TagItem = memo(({ tag, operations, isExpanded, layoutId, isMobile }: TagItemProps) => {
  const { hash } = useLocation();
  const isActive = hash === `tag/${tag.name}` || hash?.startsWith(`tag/${tag.name}/`);

  return (
    <Collapsible open={isExpanded}>
      <SidebarMenuItem className="relative group/tag" data-expanded={isExpanded} data-active={isActive}>
        {/* Rail line - visible when expanded */}
        <div className="absolute left-2.5 top-4.5 bottom-3 flex-col items-center pointer-events-none hidden group-data-[expanded=true]/tag:flex">
          <div className="w-px flex-1 bg-muted-foreground/30" />
        </div>
        {/* Tag section button */}
        <CollapsibleTrigger asChild>
          <Link
            to="/docs/operations"
            search={(prev) => ({ ...prev, operationTag: isExpanded ? undefined : tag.name })}
            hash={isExpanded ? undefined : `tag/${tag.name}`}
            replace
            resetScroll={false}
            hashScrollIntoView={{ behavior: 'instant' }}
            draggable="false"
            className={cn(
              buttonVariants({ variant: 'ghost', size: 'default' }),
              'w-full text-left pl-5 h-8 font-normal group opacity-80',
              'group-data-[expanded=true]/tag:opacity-100 group-data-[active=true]/tag:bg-accent',
            )}
          >
            <div className="absolute left-[0.53rem] w-1 h-1 rounded-full bg-muted-foreground/30 group-data-[expanded=true]/tag:bg-muted-foreground/60" />
            <span>{tag.name}</span>
            <span className="ml-2 text-xs text-muted-foreground/90 font-light opacity-0 sm:group-hover:opacity-100 transition-opacity group-data-[expanded=true]/tag:hidden">
              {tag.count}
            </span>
            <ChevronDownIcon className="size-4 invisible group-hover:visible transition-transform duration-200 opacity-40 ml-auto group-data-[expanded=true]/tag:rotate-180" />
          </Link>
        </CollapsibleTrigger>
        {/* Tag operations list */}
        <CollapsibleContent forceMount className="overflow-hidden data-[state=closed]:hidden">
          <div className="relative flex flex-col py-1 px-0">
            {operations.map((operation) => (
              <OperationItem key={operation.hash} operation={operation} layoutId={layoutId} isMobile={isMobile} />
            ))}
          </div>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
});

/**
 * Sidebar menu listing operation section tags with their operation lists.
 * Uses URL hash to track and highlight the currently visible operation.
 */
export function OperationsSidebar() {
  const layoutId = useRef(nanoid()).current;
  const isMobile = useBreakpoints('max', 'sm');

  // Fetch operations and tags (already cached by route loader)
  const { data: operations } = useSuspenseQuery(operationsQueryOptions);
  const { data: tags } = useSuspenseQuery(tagsQueryOptions);

  // Get active tag from URL search params (strict: false for fuzzy route matching)
  const { operationTag: activeTag } = useSearch({ strict: false });

  // Pre-group operations by tag to avoid filtering on every render
  const operationsByTag = useMemo(() => {
    const grouped = new Map<string, typeof operations>();
    for (const op of operations) {
      for (const tag of op.tags) {
        const existing = grouped.get(tag) ?? [];
        existing.push(op);
        grouped.set(tag, existing);
      }
    }
    return grouped;
  }, [operations]);

  return (
    <SidebarMenu className="gap-1 p-0 pt-1 pb-4">
      {tags.map((tag) => (
        <TagItem
          key={tag.name}
          tag={tag}
          operations={operationsByTag.get(tag.name) ?? []}
          isExpanded={activeTag === tag.name}
          layoutId={layoutId}
          isMobile={isMobile}
        />
      ))}
    </SidebarMenu>
  );
}
