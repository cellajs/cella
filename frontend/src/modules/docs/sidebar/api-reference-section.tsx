import { useQuery } from '@tanstack/react-query';
import { Link, useRouterState } from '@tanstack/react-router';
import { ChevronDownIcon } from 'lucide-react';
import { Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { operationsQueryOptions, schemasQueryOptions, tagsQueryOptions } from '~/modules/docs/query';
import { OperationsSidebar } from '~/modules/docs/sidebar/operations-sidebar';
import { SchemasSidebar } from '~/modules/docs/sidebar/schemas-sidebar';
import type { GenTagSummary } from '~/modules/docs/types';
import { buttonVariants } from '~/modules/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '~/modules/ui/collapsible';
import { SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenuItem } from '~/modules/ui/sidebar';
import { queryClient } from '~/query/query-client';
import { cn } from '~/utils/cn';

interface ApiReferenceSectionProps {
  label: string;
  tags: GenTagSummary[];
  isMobile: boolean;
}

/** Expansion is derived from the route, mutually exclusive, with a per-section forced-collapse override. */
export function ApiReferenceSection({ label, tags, isMobile }: ApiReferenceSectionProps) {
  const { t } = useTranslation();

  const { data: schemas } = useQuery(schemasQueryOptions);

  const { location } = useRouterState();
  const isOperationsRoute = location.pathname === '/docs/operations';
  const isOperationsTableRoute = location.pathname === '/docs/operations/table';
  const isSchemasRoute = location.pathname.includes('/docs/schemas');

  // Operations expand only in list view, not table view
  const expandedSection = isOperationsRoute ? 'operations' : isSchemasRoute ? 'schemas' : null;

  // Start collapsed when landing directly via URL without search params
  const searchParams = location.search as Record<string, unknown>;
  const activeOperationTag = searchParams.operationTag as string | undefined;
  const activeSchemaTag = searchParams.schemaTag as string | undefined;
  const hasOperationSearchParams = !!activeOperationTag || !!searchParams.q;
  const hasSchemasSearchParams = !!activeSchemaTag;
  const [forcedCollapsed, setForcedCollapsed] = useState<string | null>(
    isOperationsRoute && !hasOperationSearchParams
      ? 'operations'
      : isSchemasRoute && !hasSchemasSearchParams
        ? 'schemas'
        : null,
  );

  const prefetchOperations = () => {
    queryClient.prefetchQuery(operationsQueryOptions);
    queryClient.prefetchQuery(tagsQueryOptions);
  };

  const isListMode = !isOperationsTableRoute;
  const isOperationsActive = isOperationsRoute || isOperationsTableRoute;

  return (
    <SidebarGroup>
      <div className="flex items-center gap-3 px-4 pr-1 pb-1">
        <SidebarGroupLabel className="p-0 lowercase opacity-75">{label}</SidebarGroupLabel>
      </div>

      <SidebarGroupContent>
        <SidebarGroup className="p-1 pt-0">
          <Collapsible open={isListMode && expandedSection === 'operations' && forcedCollapsed !== 'operations'}>
            {/* Sticky tier-1 row: opaque bg so section content passes underneath */}
            <SidebarMenuItem className="sticky top-2 z-10 list-none bg-card">
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
                  <span className="ml-2 text-muted-foreground/90 text-xs">
                    {tags.reduce((sum, tag) => sum + tag.count, 0)}
                  </span>
                )}
                <ChevronDownIcon
                  className={cn(
                    'ml-auto size-4 opacity-40 transition-transform duration-200',
                    isListMode && expandedSection === 'operations' && forcedCollapsed !== 'operations' && 'rotate-180',
                  )}
                />
              </CollapsibleTrigger>
            </SidebarMenuItem>
            <CollapsibleContent
              className={cn(
                'overflow-hidden',
                !isMobile && 'data-closed:animate-collapsible-up data-open:animate-collapsible-down',
              )}
            >
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
            <SidebarMenuItem className="sticky top-2 z-10 list-none bg-card">
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
                  <span className="ml-2 text-muted-foreground/90 text-xs">{schemas.length}</span>
                )}
                <ChevronDownIcon
                  className={cn(
                    'ml-auto size-4 opacity-40 transition-transform duration-200',
                    expandedSection === 'schemas' && forcedCollapsed !== 'schemas' && 'rotate-180',
                  )}
                />
              </CollapsibleTrigger>
            </SidebarMenuItem>
            <CollapsibleContent
              className={cn(
                'overflow-hidden',
                !isMobile && 'data-closed:animate-collapsible-up data-open:animate-collapsible-down',
              )}
            >
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
