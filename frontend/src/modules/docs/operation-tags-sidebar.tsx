import { useSuspenseQuery } from '@tanstack/react-query';
import { Link, useSearch } from '@tanstack/react-router';
import { ChevronDownIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { useRef } from 'react';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { useScrollSpy } from '~/hooks/use-scroll-spy';
import { operationsQueryOptions, tagsQueryOptions } from '~/modules/docs/query';
import { Badge } from '~/modules/ui/badge';
import { buttonVariants } from '~/modules/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '~/modules/ui/collapsible';
import { SidebarMenu, SidebarMenuItem } from '~/modules/ui/sidebar';
import { cn } from '~/utils/cn';
import { nanoid } from '~/utils/nanoid';
import { useSheeter } from '../common/sheeter/use-sheeter';
import { getMethodColor } from './helpers/get-method-color';

/**
 * Sidebar menu listing operation tags with collapsible operation lists.
 * Uses scroll spy to track and highlight the currently visible operation.
 */
export function OperationTagsSidebar() {
  const layoutId = useRef(nanoid()).current;

  const isMobile = useBreakpoints('max', 'sm');

  // Fetch operations and tags (already cached by route loader)
  const { data: operations } = useSuspenseQuery(operationsQueryOptions);
  const { data: tags } = useSuspenseQuery(tagsQueryOptions);

  // Get active tag from URL search params (strict: false for fuzzy route matching)
  const { operationTag: activeTag } = useSearch({ strict: false });

  const getOperationsByTag = (tagName: string) => {
    return operations.filter((op) => op.tags.includes(tagName));
  };

  // Tag section IDs (for collapsed tags) and operation hashes (for expanded tags)
  const tagSectionIds = tags.map((t) => `tag/${t.name}`);
  const operationHashes = operations.map((op) => op.hash);
  const allSectionIds = [...tagSectionIds, ...operationHashes];

  const { currentSection, scrollToSection } = useScrollSpy({
    sectionIds: allSectionIds,
    enableWriteHash: true,
    smoothScroll: false,
  });

  return (
    <SidebarMenu className="gap-1 p-0 pt-1 pb-4">
      {tags.map((tag) => {
        const isExpanded = activeTag === tag.name;
        const isActive = currentSection === `tag/${tag.name}` || currentSection?.startsWith(`tag/${tag.name}/`);
        const tagOperations = getOperationsByTag(tag.name);

        return (
          <Collapsible key={tag.name} open={isExpanded}>
            <SidebarMenuItem className="relative group/tag" data-expanded={isExpanded} data-active={isActive}>
              {/* Rail line - visible when expanded */}
              <div className="absolute left-2.5 top-4.5 bottom-3 flex-col items-center pointer-events-none hidden group-data-[expanded=true]/tag:flex">
                <div className="w-px flex-1 bg-muted-foreground/30" />
              </div>
              {/* Tag section button - to open tag section and show tag operations in sidebar section below */}
              <CollapsibleTrigger asChild>
                {/* Tag section link button */}
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
                  {/* Dot indicator - always visible, increases opacity when expanded */}
                  <div className="absolute left-[0.53rem] w-1 h-1 rounded-full bg-muted-foreground/30 group-data-[expanded=true]/tag:bg-muted-foreground/60" />
                  <span>{tag.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground/90 font-light opacity-0 group-hover:opacity-100 transition-opacity group-data-[expanded=true]/tag:hidden">
                    {tag.count}
                  </span>
                  <ChevronDownIcon className="size-4 invisible group-hover:visible transition-transform duration-200 opacity-40 ml-auto group-data-[expanded=true]/tag:rotate-180" />
                </Link>
              </CollapsibleTrigger>
              {/* Tag operations list */}
              <CollapsibleContent className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
                <div className="relative flex flex-col py-1 px-0">
                  {tagOperations.map((operation) => {
                    const isActive = currentSection === operation.hash;
                    return (
                      <div key={operation.hash} className="relative group/operation" data-active={isActive}>
                        {isActive && (
                          <motion.span
                            layoutId={layoutId}
                            transition={{ type: 'spring', duration: 0.4, bounce: 0, delay: 0.1 }}
                            className="w-[0.20rem] bg-primary rounded-full absolute left-2 ml-px top-2 bottom-2"
                          />
                        )}
                        {/* Operation link button */}
                        <Link
                          to="/docs/operations"
                          hash={operation.hash}
                          replace
                          draggable="false"
                          className={cn(
                            buttonVariants({ variant: 'ghost', size: 'sm' }),
                            'hover:bg-accent/50 w-full justify-between text-left pl-5 group font-normal opacity-50 text-sm h-8 gap-2',
                            'group-data-[active=true]/operation:opacity-100',
                          )}
                          onClick={(e) => {
                            e.preventDefault();
                            scrollToSection(operation.hash);
                            isMobile && useSheeter.getState().remove();
                          }}
                        >
                          <span className="truncate flex-1 text-[13px] lowercase">
                            {operation.summary || operation.id}
                          </span>
                          <Badge
                            variant="secondary"
                            className={`text-[11px] p-0 shrink-0 opacity-70 group-hover:opacity-100 uppercase bg-transparent shadow-none ${getMethodColor(operation.method)}`}
                          >
                            {operation.method}
                          </Badge>
                        </Link>
                      </div>
                    );
                  })}
                </div>
              </CollapsibleContent>
            </SidebarMenuItem>
          </Collapsible>
        );
      })}
    </SidebarMenu>
  );
}
