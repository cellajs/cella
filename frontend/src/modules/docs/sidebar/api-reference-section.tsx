import { useSuspenseQuery } from '@tanstack/react-query';
import { Link, useRouterState } from '@tanstack/react-router';
import { type ReactNode, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { expandRowLinkClass, handleExpandKeys, RowExpandToggle } from '~/modules/common/row-expand-toggle';
import { operationsQueryOptions, schemasQueryOptions, tagsQueryOptions } from '~/modules/docs/query';
import { DocsSidebarSection, sidebarStickyRowClass } from '~/modules/docs/sidebar/docs-sidebar-section';
import { OperationsSidebar } from '~/modules/docs/sidebar/operations-sidebar';
import { SchemasSidebar } from '~/modules/docs/sidebar/schemas-sidebar';
import { Collapsible, CollapsibleContent, collapsiblePanelClass } from '~/modules/ui/collapsible';
import { SidebarGroupContent } from '~/modules/ui/sidebar';
import { queryClient } from '~/query/query-client';
import { cn } from '~/utils/cn';

type ApiSection = 'operations' | 'schemas';

interface ApiReferenceSectionProps {
  label: string;
}

/** A group is open on its own route; its chevron, or its label on that route, overrides that per group until the pathname changes. */
export function ApiReferenceSection({ label }: ApiReferenceSectionProps) {
  const { t } = useTranslation();

  const { data: tags } = useSuspenseQuery(tagsQueryOptions);
  const { data: schemas } = useSuspenseQuery(schemasQueryOptions);

  // Narrow selects: the whole router state changes several times per navigation
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const activeOperationTag = useRouterState({ select: (state) => state.location.search.operationTag });
  const activeSchemaTag = useRouterState({ select: (state) => state.location.search.schemaTag });
  const hasQuery = useRouterState({ select: ({ location: { search } }) => !!search.q || !!search.filter });
  const isOperationsRoute = pathname === '/docs/operations';
  const isOperationsTableRoute = pathname === '/docs/operations/table';
  const isSchemasRoute = pathname === '/docs/schemas';

  // Start collapsed when landing directly via URL without search params
  const [overrides, setOverrides] = useState<Partial<Record<ApiSection, boolean>>>(() => {
    if (isOperationsRoute && !activeOperationTag && !hasQuery) return { operations: false };
    if (isSchemasRoute && !activeSchemaTag) return { schemas: false };
    return {};
  });
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    setOverrides({});
  }

  const isOperationsOpen = overrides.operations ?? isOperationsRoute;
  const isSchemasOpen = overrides.schemas ?? isSchemasRoute;

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
        isOpen={isOperationsOpen}
        isRoute={isOperationsRoute}
        onToggle={() => setOverrides((prev) => ({ ...prev, operations: !isOperationsOpen }))}
        onPrefetch={prefetchOperations}
      >
        <OperationsSidebar activeTag={activeOperationTag} isOnRoute={isOperationsRoute} />
      </ApiReferenceGroup>
      <ApiReferenceGroup
        to="/docs/schemas"
        label={t('c:schema', { count: 2 })}
        count={schemas.length}
        isActive={isSchemasRoute}
        isOpen={isSchemasOpen}
        isRoute={isSchemasRoute}
        onToggle={() => setOverrides((prev) => ({ ...prev, schemas: !isSchemasOpen }))}
      >
        <SchemasSidebar activeTag={activeSchemaTag} isOnRoute={isSchemasRoute} />
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
  /** The group's own route is open: its label toggles it there, elsewhere it navigates. */
  isRoute: boolean;
  onToggle: () => void;
  onPrefetch?: () => void;
  children: ReactNode;
}

/** A tier-1 row of the API reference, with its tag list below. */
function ApiReferenceGroup({ to, label, count, isActive, isOpen, isRoute, onToggle, onPrefetch, children }: ApiReferenceGroupProps) {
  return (
    <Collapsible open={isOpen}>
      <div className={cn(sidebarStickyRowClass, 'group/expand-row')} onMouseEnter={onPrefetch}>
        <Link
          to={to}
          search={(prev) => prev}
          onFocus={onPrefetch}
          draggable={false}
          aria-expanded={isOpen}
          onClick={(event) => {
            if (!isRoute) return;
            event.preventDefault();
            onToggle();
          }}
          onKeyDown={(event) => handleExpandKeys(event, isOpen, onToggle)}
          className={cn(expandRowLinkClass, 'w-full justify-start pr-9', isActive && 'bg-accent font-semibold')}
        >
          <span>{label}</span>
          {!isOpen && <span className="text-faint-foreground text-xs">{count}</span>}
        </Link>
        <RowExpandToggle isExpanded={isOpen} onToggle={onToggle} />
      </div>
      <CollapsibleContent className={collapsiblePanelClass}>
        <SidebarGroupContent>
          <Suspense fallback={null}>{children}</Suspense>
        </SidebarGroupContent>
      </CollapsibleContent>
    </Collapsible>
  );
}
