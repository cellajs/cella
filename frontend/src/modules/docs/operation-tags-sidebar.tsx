import { Link, useSearch } from '@tanstack/react-router';
import { ChevronDownIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { useRef } from 'react';
import type { GenOperationSummary, GenTagSummary, TagName } from '~/api.gen/docs';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { useScrollSpy } from '~/hooks/use-scroll-spy';
import { Badge } from '~/modules/ui/badge';
import { buttonVariants } from '~/modules/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '~/modules/ui/collapsible';
import { SidebarMenu, SidebarMenuItem } from '~/modules/ui/sidebar';
import { cn } from '~/utils/cn';
import { nanoid } from '~/utils/nanoid';
import { getMethodColor } from './helpers/get-method-color';

interface OperationTagsSidebarProps {
  operations: GenOperationSummary[];
  tags: GenTagSummary[];
}

/**
 * Sidebar menu listing operation tags with collapsible operation lists.
 * Uses scroll spy to track and highlight the currently visible operation.
 */
export function OperationTagsSidebar({ operations, tags }: OperationTagsSidebarProps) {
  const isMobile = useBreakpoints('max', 'sm');
  const layoutId = useRef(nanoid()).current;

  // Get active tag from URL search params (strict: false for fuzzy route matching)
  const { tag: activeTag } = useSearch({ strict: false });

  const getOperationsByTag = (tagName: string) => {
    return operations.filter((op) => op.tags.includes(tagName));
  };

  // Tag section IDs (for collapsed tags) and operation hashes (for expanded tags)
  const tagSectionIds = tags.map((t) => `tag/${t.name}`);
  const operationHashes = operations.map((op) => op.hash);
  const allSectionIds = [...tagSectionIds, ...operationHashes];

  const { currentSection, scrollToSection } = useScrollSpy({
    sectionIds: allSectionIds,
    enableWriteHash: !isMobile,
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
            <SidebarMenuItem>
              {/* Tag section button - to open tag section and show tag operations in sidebar section below */}
              <CollapsibleTrigger asChild>
                {/* Tag section link button */}
                <Link
                  to="/docs/operations"
                  search={(prev) => ({ ...prev, tag: isExpanded ? undefined : (tag.name as TagName) })}
                  hash={isExpanded ? undefined : `tag/${tag.name}`}
                  replace
                  resetScroll={false}
                  hashScrollIntoView={{ behavior: 'instant' }}
                  draggable="false"
                  className={cn(
                    buttonVariants({ variant: 'ghost', size: 'default' }),
                    'w-full text-left h-8 font-normal group',
                    isExpanded && 'font-medium',
                    isActive && 'bg-accent',
                  )}
                >
                  <span>{tag.name}</span>
                  {!isExpanded && <span className="ml-2 text-xs text-muted-foreground/90 font-light">{tag.count}</span>}
                  <ChevronDownIcon
                    className={cn(
                      'size-4 invisible group-hover:visible transition-transform duration-200 opacity-40 ml-auto',
                      isExpanded && 'rotate-180',
                    )}
                  />
                </Link>
              </CollapsibleTrigger>
              {/* Tag operations list */}
              <CollapsibleContent className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
                <div className="relative flex flex-col py-1 ml-0.5 pl-1">
                  {/* Faded rail line */}
                  <div className="absolute left-0 top-3 bottom-3 w-px bg-muted-foreground/20 rounded-full" />
                  {tagOperations.map((operation) => {
                    const isActive = currentSection === operation.hash;
                    return (
                      <div key={operation.hash} className="relative">
                        {isActive && (
                          <motion.span
                            layoutId={layoutId}
                            transition={{ type: 'spring', duration: 0.4, bounce: 0, delay: 0.1 }}
                            className="w-[0.20rem] bg-primary rounded-full absolute -left-1.5 ml-px top-2 bottom-2"
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
                            'hover:bg-accent/50 w-full justify-between text-left group font-normal opacity-75 text-sm h-8 gap-2 px-2',
                            isActive && 'font-medium opacity-100',
                          )}
                          onClick={(e) => {
                            e.preventDefault();
                            scrollToSection(operation.hash);
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
