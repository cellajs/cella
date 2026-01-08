import { isNull, not, useLiveQuery } from '@tanstack/react-db';
import { Link, useNavigate, useRouterState, useSearch } from '@tanstack/react-router';
import { ChevronDownIcon, ListIcon, PencilIcon, TableIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { useRef, useState } from 'react';
import type { OperationSummary, TagName, TagSummary } from '~/api.gen/docs';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { useScrollSpy } from '~/hooks/use-scroll-spy';
import Logo from '~/modules/common/logo';
import type { initPagesCollection } from '~/modules/pages/collections';
import { Badge } from '~/modules/ui/badge';
import { buttonVariants } from '~/modules/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '~/modules/ui/collapsible';
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
} from '~/modules/ui/sidebar';
import { ToggleGroup, ToggleGroupItem } from '~/modules/ui/toggle-group';
import { useUserStore } from '~/store/user';
import { cn } from '~/utils/cn';
import { nanoid } from '~/utils/nanoid';
import { getMethodColor } from './helpers/get-method-color';

interface DocsSidebarProps {
  operations: OperationSummary[];
  tags: TagSummary[];
  pagesCollection: ReturnType<typeof initPagesCollection>;
}

export function DocsSidebar({ operations, tags, pagesCollection }: DocsSidebarProps) {
  const isMobile = useBreakpoints('max', 'sm');
  const layoutId = useRef(nanoid()).current;

  const { systemRole } = useUserStore();

  // Get current pathname to determine active/expanded section
  const { location } = useRouterState();
  const isOverviewRoute = location.pathname.includes('/docs/overview');
  const isOperationsRoute = location.pathname === '/docs' || location.pathname === '/docs/';
  const isSchemasRoute = location.pathname.includes('/docs/schemas');

  // Derive expanded section directly from route (mutually exclusive)
  const expandedSection = isOperationsRoute ? 'operations' : isSchemasRoute ? 'schemas' : null;

  // Get active tag and viewMode from URL search params
  const { tag: activeTag, viewMode = 'list' } = useSearch({ from: '/publicLayout/docs' });
  const navigate = useNavigate();

  // Track sections that are forcibly collapsed (only applies in list mode)
  const [forcedCollapsed, setForcedCollapsed] = useState<Set<string>>(new Set());

  const toggleForcedCollapse = (section: string) => {
    setForcedCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };

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

  // Live query for pages - only published pages, ordered by name
  const { data: pages } = useLiveQuery(
    (liveQuery) =>
      liveQuery
        .from({ page: pagesCollection })
        .where(({ page }) => not(isNull(page.id)))
        .orderBy(({ page }) => page.name, 'asc'),
    [],
  );

  const isListMode = viewMode === 'list';

  return (
    <SidebarContent className="pt-4 pb-12">
      {/* Logo */}
      <div className="px-4 my-2">
        <Link
          to="/about"
          className="inline-block transition-transform hover:scale-105 active:scale-100 focus-effect rounded-md"
          aria-label="Go to about page"
        >
          <Logo height={32} />
        </Link>
      </div>

      {/* API reference */}
      <SidebarGroup>
        <div className="flex items-center gap-3 px-4 pr-1">
          <SidebarGroupLabel className="opacity-75 p-0">api reference</SidebarGroupLabel>
          <ToggleGroup
            type="single"
            size="sm"
            value={viewMode}
            onValueChange={(value: 'list' | 'table') => {
              if (value) navigate({ to: location.pathname, search: (prev) => ({ ...prev, viewMode: value }) });
            }}
          >
            <ToggleGroupItem value="list" className="h-6 w-6 p-0">
              <ListIcon className="size-3.5" />
            </ToggleGroupItem>
            <ToggleGroupItem value="table" className="h-6 w-6 p-0">
              <TableIcon className="size-3.5" />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
        <SidebarGroupContent>
          {/* Overview */}
          <SidebarGroup className="p-1">
            <SidebarMenuItem className="list-none">
              <Link
                to="/docs/overview"
                search={(prev) => prev}
                className={cn(
                  buttonVariants({ variant: 'ghost', size: 'lg' }),
                  'w-full justify-start font-normal group px-3 lowercase',
                  isOverviewRoute && 'font-medium bg-accent',
                )}
              >
                <span>overview</span>
              </Link>
            </SidebarMenuItem>
          </SidebarGroup>

          {/* Operations */}
          <SidebarGroup className="p-1">
            <Collapsible open={isListMode && expandedSection === 'operations' && !forcedCollapsed.has('operations')}>
              <SidebarMenuItem className="list-none">
                {isListMode ? (
                  <CollapsibleTrigger asChild>
                    <Link
                      to="/docs"
                      search={(prev) => prev}
                      onClick={(e) => {
                        if (isOperationsRoute) {
                          e.preventDefault();
                          toggleForcedCollapse('operations');
                        } else {
                          // Clear forced collapse when navigating to operations
                          setForcedCollapsed((prev) => {
                            const next = new Set(prev);
                            next.delete('operations');
                            return next;
                          });
                        }
                      }}
                      className={cn(
                        buttonVariants({ variant: 'ghost', size: 'lg' }),
                        'w-full justify-start font-normal group px-3 lowercase',
                        isOperationsRoute && 'font-medium bg-accent',
                      )}
                    >
                      <span>operations</span>
                      {(expandedSection !== 'operations' || forcedCollapsed.has('operations')) && (
                        <span className="ml-2 text-xs text-muted-foreground/90 font-light">{operations.length}</span>
                      )}
                      <ChevronDownIcon
                        className={cn(
                          'size-4 ml-auto transition-transform duration-200 opacity-40',
                          expandedSection === 'operations' && !forcedCollapsed.has('operations') && 'rotate-180',
                        )}
                      />
                    </Link>
                  </CollapsibleTrigger>
                ) : (
                  <Link
                    to="/docs"
                    search={(prev) => prev}
                    className={cn(
                      buttonVariants({ variant: 'ghost', size: 'lg' }),
                      'w-full justify-start font-normal group px-3 lowercase',
                      isOperationsRoute && 'font-medium bg-accent',
                    )}
                  >
                    <span>operations</span>
                    <span className="ml-2 text-xs text-muted-foreground/90 font-light">{operations.length}</span>
                  </Link>
                )}
              </SidebarMenuItem>
              <CollapsibleContent className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
                <SidebarGroupContent>
                  <SidebarMenu className="gap-1 p-0 pt-1">
                    {tags.map((tag) => {
                      const isExpanded = activeTag === tag.name;
                      const isActive =
                        currentSection === `tag/${tag.name}` || currentSection?.startsWith(`tag/${tag.name}/`);
                      const tagOperations = getOperationsByTag(tag.name);

                      return (
                        <Collapsible key={tag.name} open={isExpanded}>
                          <SidebarMenuItem>
                            <CollapsibleTrigger asChild>
                              <Link
                                to="/docs"
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
                                {!isExpanded && (
                                  <span className="ml-2 text-xs text-muted-foreground/90 font-light">{tag.count}</span>
                                )}
                                <ChevronDownIcon
                                  className={cn(
                                    'size-4 invisible group-hover:visible transition-transform duration-200 opacity-40 ml-auto',
                                    isExpanded && 'rotate-180',
                                  )}
                                />
                              </Link>
                            </CollapsibleTrigger>
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
                                      <Link
                                        to="/docs"
                                        hash={operation.hash}
                                        replace
                                        draggable="false"
                                        className={cn(
                                          buttonVariants({ variant: 'ghost', size: 'sm' }),
                                          'hover:bg-accent/50 w-full justify-between text-left font-normal opacity-75 text-sm h-8 gap-2 px-2',
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
                                          className={`text-[11px] p-0 shrink-0 uppercase bg-transparent shadow-none ${getMethodColor(operation.method)}`}
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
                </SidebarGroupContent>
              </CollapsibleContent>
            </Collapsible>
          </SidebarGroup>

          {/* Schemas */}
          <SidebarGroup className="p-1">
            <Collapsible open={isListMode && expandedSection === 'schemas' && !forcedCollapsed.has('schemas')}>
              <SidebarMenuItem className="list-none">
                {isListMode ? (
                  <CollapsibleTrigger asChild>
                    <Link
                      to="/docs/schemas"
                      search={(prev) => prev}
                      onClick={(e) => {
                        if (isSchemasRoute) {
                          e.preventDefault();
                          toggleForcedCollapse('schemas');
                        } else {
                          // Clear forced collapse when navigating to schemas
                          setForcedCollapsed((prev) => {
                            const next = new Set(prev);
                            next.delete('schemas');
                            return next;
                          });
                        }
                      }}
                      className={cn(
                        buttonVariants({ variant: 'ghost', size: 'lg' }),
                        'w-full justify-start font-normal group px-3 lowercase',
                        isSchemasRoute && 'font-medium bg-accent',
                      )}
                    >
                      <span>schemas</span>
                      <ChevronDownIcon
                        className={cn(
                          'size-4 ml-auto transition-transform duration-200 opacity-40',
                          expandedSection === 'schemas' && !forcedCollapsed.has('schemas') && 'rotate-180',
                        )}
                      />
                    </Link>
                  </CollapsibleTrigger>
                ) : (
                  <Link
                    to="/docs/schemas"
                    search={(prev) => prev}
                    className={cn(
                      buttonVariants({ variant: 'ghost', size: 'lg' }),
                      'w-full justify-start font-normal group px-3 lowercase',
                      isSchemasRoute && 'font-medium bg-accent',
                    )}
                  >
                    <span>schemas</span>
                  </Link>
                )}
              </SidebarMenuItem>
              <CollapsibleContent className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <span className="px-4 text-sm text-muted-foreground lowercase">Coming soon...</span>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </Collapsible>
          </SidebarGroup>
        </SidebarGroupContent>
      </SidebarGroup>

      {/* Pages */}
      <SidebarGroup>
        <div className="flex items-center gap-3 px-4 pr-1">
          <SidebarGroupLabel className="opacity-75 p-0">pages</SidebarGroupLabel>
          {systemRole && (
            <Link
              to="/docs/pages"
              className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'h-6 w-6 p-0')}
              aria-label="Manage pages"
            >
              <PencilIcon className="size-3.5" />
            </Link>
          )}
        </div>
        <SidebarGroupContent>
          <SidebarMenu>
            {pages && pages.length > 0 ? (
              pages.map((page) => (
                <SidebarMenuItem key={page.id}>
                  <Link
                    to="/docs/page/$id/$mode"
                    params={{ id: page.id, mode: 'view' }}
                    className={cn(
                      buttonVariants({ variant: 'ghost', size: 'lg' }),
                      'w-full justify-start font-normal group px-3 lowercase',
                    )}
                  >
                    <span className="truncate">{page.name}</span>
                  </Link>
                </SidebarMenuItem>
              ))
            ) : (
              <SidebarMenuItem>
                <span className="px-3 py-2 text-sm text-muted-foreground lowercase">No pages yet</span>
              </SidebarMenuItem>
            )}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>
  );
}
