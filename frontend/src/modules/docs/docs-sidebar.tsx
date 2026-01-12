import { isNull, not, useLiveQuery } from '@tanstack/react-db';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Link, useRouterState } from '@tanstack/react-router';
import { appConfig } from 'config';
import { ChevronDownIcon, PencilIcon } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GenOperationSummary, GenTagSummary } from '~/api.gen/docs';
import { schemas } from '~/api.gen/docs';
import Logo from '~/modules/common/logo';
import { JsonActions } from '~/modules/docs/json-actions';
import { OperationTagsSidebar } from '~/modules/docs/operation-tags-sidebar';
import { SchemaTagsSidebar } from '~/modules/docs/schema-tags-sidebar';
import type { initPagesCollection } from '~/modules/pages/collections';
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
import { useDocsStore } from '~/store/docs';
import { useUserStore } from '~/store/user';
import { cn } from '~/utils/cn';
import UserTheme from '../me/user-theme';
import { openApiSpecQueryOptions, openApiUrl } from './query';

const DebugToolbars =
  appConfig.mode !== 'production' ? lazy(() => import('~/modules/common/debug-toolbars')) : () => null;

/** Suspense-wrapped JsonActions for OpenAPI spec */
const OpenApiJsonActions = () => {
  const { t } = useTranslation();
  const { data } = useSuspenseQuery(openApiSpecQueryOptions);
  return (
    <JsonActions
      url={openApiUrl}
      smallMode
      data={data}
      filename="openapi.json"
      resourceName={t('common:docs.openapi_json')}
      viewerUrl="/docs/overview"
    />
  );
};

interface DocsSidebarProps {
  operations: GenOperationSummary[];
  tags: GenTagSummary[];
  pagesCollection: ReturnType<typeof initPagesCollection>;
}

/**
 * Sidebar for the Docs section, including logo, Spec JSON actions, API reference (operations & schemas), and pages groups.
 */
export function DocsSidebar({ operations, tags, pagesCollection }: DocsSidebarProps) {
  const { t } = useTranslation();

  const { systemRole } = useUserStore();

  // Get current pathname to determine active/expanded section
  const { location } = useRouterState();
  const isOperationsRoute = location.pathname === '/docs/operations';
  const isSchemasRoute = location.pathname.includes('/docs/schemas');

  // Derive expanded section directly from route (mutually exclusive)
  const expandedSection = isOperationsRoute ? 'operations' : isSchemasRoute ? 'schemas' : null;

  // Get viewMode from docs store
  const viewMode = useDocsStore((state) => state.viewMode);

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
    <SidebarContent className="pt-4 pb-12 bg-card min-h-screen">
      {/* Logo */}
      <div className="px-4 my-2 flex justify-center">
        <Link
          to="/"
          className="inline-block transition-transform hover:scale-105 active:scale-100 focus-effect rounded-md"
          aria-label="Go to homepage"
        >
          <Logo height={32} />
        </Link>
      </div>

      {/* API spec action buttons and user theme */}
      <SidebarGroup>
        <div className="flex justify-center pb-3">
          <Suspense fallback={null}>
            <OpenApiJsonActions />
            <UserTheme buttonClassName="ml-2 h-7 w-8" size={16} />
          </Suspense>
        </div>
      </SidebarGroup>

      {/* API reference */}
      <SidebarGroup>
        <div className="flex items-center gap-3 px-4 pb-1 pr-1">
          <SidebarGroupLabel className="opacity-75 p-0 lowercase">{t('common:docs.api_reference')}</SidebarGroupLabel>
        </div>

        <SidebarGroupContent>
          {/* Operations */}
          <SidebarGroup className="p-1 pt-0">
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
                        buttonVariants({ variant: 'ghost' }),
                        'w-full justify-start font-normal items-center group px-3 lowercase',
                        isOperationsRoute && 'font-medium bg-accent',
                      )}
                    >
                      <span>{t('common:operation', { count: 2 })}</span>
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
                    to="/docs/operations"
                    search={(prev) => prev}
                    className={cn(
                      buttonVariants({ variant: 'ghost' }),
                      'w-full justify-start font-normal group px-3 lowercase',
                      isOperationsRoute && 'font-medium bg-accent',
                    )}
                  >
                    <span>{t('common:operation', { count: 2 })}</span>
                    <span className="ml-2 text-xs text-muted-foreground/90 font-light">{operations.length}</span>
                  </Link>
                )}
              </SidebarMenuItem>
              <CollapsibleContent className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
                <SidebarGroupContent>
                  {/* Operation tags sidebar */}
                  <OperationTagsSidebar operations={operations} tags={tags} />
                </SidebarGroupContent>
              </CollapsibleContent>
            </Collapsible>
          </SidebarGroup>

          {/* Schemas */}
          <SidebarGroup className="p-1 pt-0">
            <Collapsible open={expandedSection === 'schemas' && !forcedCollapsed.has('schemas')}>
              <SidebarMenuItem className="list-none">
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
                      buttonVariants({ variant: 'ghost' }),
                      'w-full justify-start font-normal group px-3 lowercase',
                      isSchemasRoute && 'font-medium bg-accent',
                    )}
                  >
                    <span>{t('common:schema', { count: 2 })}</span>
                    {(expandedSection !== 'schemas' || forcedCollapsed.has('schemas')) && (
                      <span className="ml-2 text-xs text-muted-foreground/90 font-light">{schemas.length}</span>
                    )}
                    <ChevronDownIcon
                      className={cn(
                        'size-4 ml-auto transition-transform duration-200 opacity-40',
                        expandedSection === 'schemas' && !forcedCollapsed.has('schemas') && 'rotate-180',
                      )}
                    />
                  </Link>
                </CollapsibleTrigger>
              </SidebarMenuItem>
              <CollapsibleContent className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
                <SidebarGroupContent>
                  {/* Schemas tags list */}
                  <SchemaTagsSidebar />
                </SidebarGroupContent>
              </CollapsibleContent>
            </Collapsible>
          </SidebarGroup>
        </SidebarGroupContent>
      </SidebarGroup>

      {/* Pages */}
      <SidebarGroup>
        <div className="flex items-center gap-3 px-4 pr-1">
          <SidebarGroupLabel className="opacity-75 p-0 lowercase">{t('common:pages')}</SidebarGroupLabel>
          {/* Edit pages */}
          {systemRole && (
            <Link
              to="/docs/pages"
              className={cn(buttonVariants({ variant: 'ghost', size: 'xs' }), 'h-7 w-8 p-0')}
              aria-label="Manage pages"
            >
              <PencilIcon size={14} />
            </Link>
          )}
        </div>
        {/* List of pages */}
        <SidebarGroupContent>
          <SidebarMenu>
            {pages && pages.length > 0 ? (
              pages.map((page) => (
                <SidebarMenuItem key={page.id}>
                  <Link
                    to="/docs/page/$id/$mode"
                    params={{ id: page.id, mode: 'view' }}
                    className={cn(
                      buttonVariants({ variant: 'ghost' }),
                      'w-full justify-start font-normal group px-3 lowercase',
                    )}
                  >
                    <span className="truncate">{page.name}</span>
                  </Link>
                </SidebarMenuItem>
              ))
            ) : (
              <SidebarMenuItem>
                <span className="px-3 py-2 text-sm text-muted-foreground lowercase">
                  {t('common:docs.no_pages_yet')}
                </span>
              </SidebarMenuItem>
            )}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      {/* Debug Toolbars */}
      <div className="mt-auto p-4">
        <Suspense>{DebugToolbars ? <DebugToolbars /> : null}</Suspense>
      </div>
    </SidebarContent>
  );
}
