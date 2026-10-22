import { useSuspenseQuery } from '@tanstack/react-query';
import { Link, useRouterState } from '@tanstack/react-router';
import { ChevronDownIcon } from 'lucide-react';
import { type MouseEvent, type ReactNode, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { collapsiblePanelClass } from '~/modules/docs/collapsible-panel';
import { operationsQueryOptions, schemasQueryOptions, tagsQueryOptions } from '~/modules/docs/query';
import { DocsSidebarSection } from '~/modules/docs/sidebar/docs-sidebar-section';
import { OperationsSidebar } from '~/modules/docs/sidebar/operations-sidebar';
import { SchemasSidebar } from '~/modules/docs/sidebar/schemas-sidebar';
import { buttonVariants } from '~/modules/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '~/modules/ui/collapsible';
import { SidebarGroupContent } from '~/modules/ui/sidebar';
import { queryClient } from '~/query/query-client';
import { cn } from '~/utils/cn';

/** Search params of the operations and schemas routes; the router types location.search as the union of all routes. */
type DocsSearch = { operationTag?: string; schemaTag?: string; q?: string };

type ApiSection = 'operations' | 'schemas';

interface ApiReferenceSectionProps {
  label: string;
}

/** Expansion is derived from the route, mutually exclusive, with a per-section forced-collapse override. */
export function ApiReferenceSection({ label }: ApiReferenceSectionProps) {
  const { t } = useTranslation();

  const { data: tags } = useSuspenseQuery(tagsQueryOptions);
  const { data: schemas } = useSuspenseQuery(schemasQueryOptions);

  // Narrow selects: the whole router state changes several times per navigation
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const activeOperationTag = useRouterState({ select: (state) => (state.location.search as DocsSearch).operationTag });
  const activeSchemaTag = useRouterState({ select: (state) => (state.location.search as DocsSearch).schemaTag });
  const hasQuery = useRouterState({ select: (state) => !!(state.location.search as DocsSearch).q });
  const isOperationsRoute = pathname === '/docs/operations';
  const isOperationsTableRoute = pathname === '/docs/operations/table';
  const isSchemasRoute = pathname.includes('/docs/schemas');

  // Start collapsed when landing directly via URL without search params
  const hasOperationSearchParams = !!activeOperationTag || hasQuery;
  const hasSchemasSearchParams = !!activeSchemaTag;
  const initialForcedCollapsed =
    isOperationsRoute && !hasOperationSearchParams ? 'operations' : isSchemasRoute && !hasSchemasSearchParams ? 'schemas' : null;
  const [forcedCollapsed, setForcedCollapsed] = useState<ApiSection | null>(initialForcedCollapsed);

  // On its own route a section's link toggles it; elsewhere it navigates and clears only that section's forced collapse
  const handleSectionClick = (event: MouseEvent, section: ApiSection, isRoute: boolean) => {
    if (isRoute) event.preventDefault();
    setForcedCollapsed((prev) => (prev === section ? null : isRoute ? section : prev));
  };

  const prefetchOperations = () => {
    void queryClient.query(operationsQueryOptions).catch(() => {});
    void queryClient.query(tagsQueryOptions).catch(() => {});
  };

  return (
    <DocsSidebarSection label={label}>
      <ApiReferenceGroup
        to="/docs/operations"
        label={t('c:operation', { count: 2 })}
        count={tags.reduce((sum, tag) => sum + tag.count, 0)}
        isActive={isOperationsRoute || isOperationsTableRoute}
        isOpen={isOperationsRoute && forcedCollapsed !== 'operations'}
        onClick={(event) => handleSectionClick(event, 'operations', isOperationsRoute)}
        onPrefetch={prefetchOperations}
      >
        <OperationsSidebar activeTag={activeOperationTag} />
      </ApiReferenceGroup>
      <ApiReferenceGroup
        to="/docs/schemas"
        label={t('c:schema', { count: 2 })}
        count={schemas.length}
        isActive={isSchemasRoute}
        isOpen={isSchemasRoute && forcedCollapsed !== 'schemas'}
        onClick={(event) => handleSectionClick(event, 'schemas', isSchemasRoute)}
      >
        <SchemasSidebar activeTag={activeSchemaTag} />
      </ApiReferenceGroup>
    </DocsSidebarSection>
  );
}

interface ApiReferenceGroupProps {
  to: '/docs/operations' | '/docs/schemas';
  label: string;
  /** Shown while the group is closed. */
  count: number;
  isActive: boolean;
  isOpen: boolean;
  onClick: (event: MouseEvent) => void;
  onPrefetch?: () => void;
  children: ReactNode;
}

/** A tier-1 row of the API reference, with its tag list below. */
function ApiReferenceGroup({ to, label, count, isActive, isOpen, onClick, onPrefetch, children }: ApiReferenceGroupProps) {
  return (
    <Collapsible open={isOpen}>
      {/* Sticky tier-1 row: opaque bg so section content passes underneath */}
      <div className="group/menu-item relative sticky top-2 z-10 bg-card">
        <CollapsibleTrigger
          render={
            <Link
              to={to}
              search={(prev) => prev}
              onMouseEnter={onPrefetch}
              onFocus={onPrefetch}
              draggable={false}
              onClick={onClick}
              className={cn(
                buttonVariants({ variant: 'ghost' }),
                'group w-full justify-start px-3 font-medium lowercase',
                isActive && 'bg-accent font-semibold',
              )}
            />
          }
        >
          <span>{label}</span>
          {!isOpen && <span className="text-muted-foreground text-xs">{count}</span>}
          <ChevronDownIcon className={cn('ml-auto size-4 opacity-40 transition-transform duration-200', isOpen && 'rotate-180')} />
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent className={collapsiblePanelClass}>
        <SidebarGroupContent>
          <Suspense fallback={null}>{children}</Suspense>
        </SidebarGroupContent>
      </CollapsibleContent>
    </Collapsible>
  );
}
