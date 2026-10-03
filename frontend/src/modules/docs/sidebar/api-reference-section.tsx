import { useQuery } from '@tanstack/react-query';
import { Link, useRouterState } from '@tanstack/react-router';
import { ChevronDownIcon } from 'lucide-react';
import { Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GenTagSummary } from 'sdk/docs-types';
import { operationsQueryOptions, schemasQueryOptions, tagsQueryOptions } from '~/modules/docs/query';
import { OperationsSidebar } from '~/modules/docs/sidebar/operations-sidebar';
import { SchemasSidebar } from '~/modules/docs/sidebar/schemas-sidebar';
import { buttonVariants } from '~/modules/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '~/modules/ui/collapsible';
import { SidebarGroup, SidebarGroupContent, SidebarGroupLabel } from '~/modules/ui/sidebar';
import { queryClient } from '~/query/query-client';
import { cn } from '~/utils/cn';

/** Search params of the operations and schemas routes; the router types location.search as the union of all routes. */
type DocsSearch = { operationTag?: string; schemaTag?: string; q?: string };

interface ApiReferenceSectionProps {
  label: string;
  tags: GenTagSummary[];
}

/** Expansion is derived from the route, mutually exclusive, with a per-section forced-collapse override. */
export function ApiReferenceSection({ label, tags }: ApiReferenceSectionProps) {
  const { t } = useTranslation();

  const { data: schemas } = useQuery(schemasQueryOptions);

  // Narrow selects: the whole router state changes several times per navigation
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const activeOperationTag = useRouterState({ select: (state) => (state.location.search as DocsSearch).operationTag });
  const activeSchemaTag = useRouterState({ select: (state) => (state.location.search as DocsSearch).schemaTag });
  const hasQuery = useRouterState({ select: (state) => !!(state.location.search as DocsSearch).q });
  const isOperationsRoute = pathname === '/docs/operations';
  const isOperationsTableRoute = pathname === '/docs/operations/table';
  const isSchemasRoute = pathname.includes('/docs/schemas');

  // Operations expand only in list view, not table view
  const expandedSection = isOperationsRoute ? 'operations' : isSchemasRoute ? 'schemas' : null;

  // Start collapsed when landing directly via URL without search params
  const hasOperationSearchParams = !!activeOperationTag || hasQuery;
  const hasSchemasSearchParams = !!activeSchemaTag;
  const initialForcedCollapsed =
    isOperationsRoute && !hasOperationSearchParams ? 'operations' : isSchemasRoute && !hasSchemasSearchParams ? 'schemas' : null;
  const [forcedCollapsed, setForcedCollapsed] = useState<string | null>(initialForcedCollapsed);

  const prefetchOperations = () => {
    queryClient.prefetchQuery(operationsQueryOptions);
    queryClient.prefetchQuery(tagsQueryOptions);
  };

  const isListMode = !isOperationsTableRoute;
  const isOperationsActive = isOperationsRoute || isOperationsTableRoute;

  return (
    <SidebarGroup>
      <div className="flex items-center gap-3 px-4 pr-1 pb-1">
        <SidebarGroupLabel className="p-0 text-muted-foreground lowercase">{label}</SidebarGroupLabel>
      </div>

      <SidebarGroupContent>
        <SidebarGroup className="p-1 pt-0">
          <Collapsible open={isListMode && expandedSection === 'operations' && forcedCollapsed !== 'operations'}>
            {/* Sticky tier-1 row: opaque bg so section content passes underneath */}
            <div className="group/menu-item relative sticky top-2 z-10 bg-card">
              <CollapsibleTrigger
                render={
                  <Link
                    to="/docs/operations"
                    search={(prev) => prev}
                    onMouseEnter={prefetchOperations}
                    onFocus={prefetchOperations}
                    draggable={false}
                    onClick={(e) => {
                      if (isOperationsRoute) {
                        e.preventDefault();
                        setForcedCollapsed((prev) => (prev === 'operations' ? null : 'operations'));
                      } else {
                        // Only clear if operations was forcibly collapsed, preserve other section's state
                        setForcedCollapsed((prev) => (prev === 'operations' ? null : prev));
                      }
                    }}
                    className={cn(
                      buttonVariants({ variant: 'ghost' }),
                      'group w-full items-center justify-start px-3 font-medium lowercase',
                      isOperationsActive && 'bg-accent',
                    )}
                  />
                }
              >
                <span>{t('c:operation', { count: 2 })}</span>
                {(!isListMode || expandedSection !== 'operations' || forcedCollapsed === 'operations') && (
                  <span className="text-muted-foreground text-xs">{tags.reduce((sum, tag) => sum + tag.count, 0)}</span>
                )}
                <ChevronDownIcon
                  className={cn(
                    'ml-auto size-4 opacity-40 transition-transform duration-200',
                    isListMode && expandedSection === 'operations' && forcedCollapsed !== 'operations' && 'rotate-180',
                  )}
                />
              </CollapsibleTrigger>
            </div>
            <CollapsibleContent className={'overflow-hidden md:data-closed:animate-collapsible-up md:data-open:animate-collapsible-down'}>
              <SidebarGroupContent>
                <Suspense fallback={null}>
                  <OperationsSidebar activeTag={activeOperationTag} />
                </Suspense>
              </SidebarGroupContent>
            </CollapsibleContent>
          </Collapsible>
        </SidebarGroup>

        <SidebarGroup className="p-1 pt-0">
          <Collapsible open={expandedSection === 'schemas' && forcedCollapsed !== 'schemas'}>
            <div className="group/menu-item relative sticky top-2 z-10 bg-card">
              <CollapsibleTrigger
                render={
                  <Link
                    to="/docs/schemas"
                    search={(prev) => prev}
                    draggable={false}
                    onClick={(e) => {
                      if (isSchemasRoute) {
                        e.preventDefault();
                        setForcedCollapsed((prev) => (prev === 'schemas' ? null : 'schemas'));
                      } else {
                        setForcedCollapsed((prev) => (prev === 'schemas' ? null : prev));
                      }
                    }}
                    className={cn(
                      buttonVariants({ variant: 'ghost' }),
                      'group w-full justify-start px-3 font-medium lowercase',
                      isSchemasRoute && 'bg-accent',
                    )}
                  />
                }
              >
                <span>{t('c:schema', { count: 2 })}</span>
                {(expandedSection !== 'schemas' || forcedCollapsed === 'schemas') && schemas && (
                  <span className="text-muted-foreground text-xs">{schemas.length}</span>
                )}
                <ChevronDownIcon
                  className={cn(
                    'ml-auto size-4 opacity-40 transition-transform duration-200',
                    expandedSection === 'schemas' && forcedCollapsed !== 'schemas' && 'rotate-180',
                  )}
                />
              </CollapsibleTrigger>
            </div>
            <CollapsibleContent className={'overflow-hidden md:data-closed:animate-collapsible-up md:data-open:animate-collapsible-down'}>
              <SidebarGroupContent>
                <Suspense fallback={null}>
                  <SchemasSidebar activeTag={activeSchemaTag} />
                </Suspense>
              </SidebarGroupContent>
            </CollapsibleContent>
          </Collapsible>
        </SidebarGroup>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
