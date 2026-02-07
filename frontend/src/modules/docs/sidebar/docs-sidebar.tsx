import { useInfiniteQuery, useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { Link, useRouterState } from '@tanstack/react-router';
import { ChevronDownIcon, PencilIcon } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { Logo } from '~/modules/common/logo';
import { JsonActions } from '~/modules/docs/json-actions';
import { operationsQueryOptions, schemasQueryOptions, tagsQueryOptions } from '~/modules/docs/query';
import { OperationsSidebar } from '~/modules/docs/sidebar/operations-sidebar';
import { SchemasSidebar } from '~/modules/docs/sidebar/schemas-sidebar';
import type { GenTagSummary } from '~/modules/docs/types';
import { pagesListQueryOptions } from '~/modules/page/query';
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
import { queryClient } from '~/query/query-client';
import { useUserStore } from '~/store/user';
import { cn } from '~/utils/cn';
import { useSheeter } from '../../common/sheeter/use-sheeter';
import { UserTheme } from '../../me/user-theme';
import { openApiSpecQueryOptions, openApiUrl } from '../query';

const DebugDropdown =
  appConfig.mode !== 'production' ? lazy(() => import('~/modules/common/debug-dropdown')) : () => null;

/** Suspense-wrapped JsonActions for OpenAPI spec */
function OpenApiJsonActions() {
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
}

interface DocsSidebarProps {
  tags: GenTagSummary[];
}

/**
 * Sidebar for the Docs section, including logo, Spec JSON actions, API reference (operations & schemas), and pages groups.
 */
export function DocsSidebar({ tags }: DocsSidebarProps) {
  const { t } = useTranslation();
  const isMobile = useBreakpoints('max', 'sm');

  const { systemRole } = useUserStore();

  // Fetch schemas data for sidebar count (non-suspense to avoid sheet reload on mobile)
  const { data: schemas } = useQuery(schemasQueryOptions);

  // Get current pathname to determine active/expanded section
  const { location } = useRouterState();
  const isOperationsRoute = location.pathname === '/docs/operations';
  const isOperationsTableRoute = location.pathname === '/docs/operations/table';
  const isSchemasRoute = location.pathname.includes('/docs/schemas');

  // Derive expanded section directly from route (mutually exclusive)
  // Only expand operations sidebar when on list view, not table view
  const expandedSection = isOperationsRoute ? 'operations' : isSchemasRoute ? 'schemas' : null;

  // Track if current section is forcibly collapsed
  const [forcedCollapsed, setForcedCollapsed] = useState<string | null>(null);

  // Query for pages - using React Query instead of useLiveQuery
  const { data: pages } = useInfiniteQuery({
    ...pagesListQueryOptions({}),
    select: ({ pages }) => pages.flatMap(({ items }) => items),
  });

  const closeSheet = () => {
    if (!isMobile) return;
    useSheeter.getState().remove();
  };

  // Prefetch operations data on hover for instant expand
  const prefetchOperations = () => {
    queryClient.prefetchQuery(operationsQueryOptions);
    queryClient.prefetchQuery(tagsQueryOptions);
  };

  // Determine if we're in list mode (not on table route)
  const isListMode = !isOperationsTableRoute;
  // Operations sidebar is active when on either operations route
  const isOperationsActive = isOperationsRoute || isOperationsTableRoute;

  return (
    <SidebarContent className="pt-4 pb-12 bg-card min-h-screen">
      {/* Logo */}
      <div className="px-4 my-2 flex justify-center">
        <Link
          to="/"
          className="inline-block transition-transform hover:scale-105 active:scale-100 focus-effect rounded-md"
          aria-label="Go to homepage"
          onClick={closeSheet}
        >
          <Logo height={32} />
        </Link>
      </div>

      {/* API spec action buttons and user theme */}
      <SidebarGroup>
        <div className="flex justify-center pb-3">
          <Suspense fallback={<div className="h-7 w-60 rounded-md border border-input bg-background/50" />}>
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
            <Collapsible open={isListMode && expandedSection === 'operations' && forcedCollapsed !== 'operations'}>
              <SidebarMenuItem className="list-none">
                <CollapsibleTrigger asChild>
                  <Link
                    to="/docs/operations"
                    search={(prev) => prev}
                    onMouseEnter={prefetchOperations}
                    onFocus={prefetchOperations}
                    onClick={(e) => {
                      // If already on operations list route, toggle collapse
                      if (isOperationsRoute) {
                        e.preventDefault();
                        setForcedCollapsed((prev) => (prev === 'operations' ? null : 'operations'));
                      } else {
                        setForcedCollapsed(null);
                      }
                    }}
                    className={cn(
                      buttonVariants({ variant: 'ghost' }),
                      'w-full justify-start font-normal items-center group px-3 lowercase',
                      isOperationsActive && 'font-medium bg-accent',
                    )}
                  >
                    <span>{t('common:operation', { count: 2 })}</span>
                    {(!isListMode || expandedSection !== 'operations' || forcedCollapsed === 'operations') && (
                      <span className="ml-2 text-xs text-muted-foreground/90 font-light">
                        {tags.reduce((sum, tag) => sum + tag.count, 0)}
                      </span>
                    )}
                    <ChevronDownIcon
                      className={cn(
                        'size-4 ml-auto transition-transform duration-200 opacity-40',
                        isListMode &&
                          expandedSection === 'operations' &&
                          forcedCollapsed !== 'operations' &&
                          'rotate-180',
                      )}
                    />
                  </Link>
                </CollapsibleTrigger>
              </SidebarMenuItem>
              <CollapsibleContent forceMount className="overflow-hidden data-[state=closed]:hidden">
                <SidebarGroupContent>
                  {/* Operation tags sidebar */}
                  <Suspense fallback={null}>
                    <OperationsSidebar />
                  </Suspense>
                </SidebarGroupContent>
              </CollapsibleContent>
            </Collapsible>
          </SidebarGroup>

          {/* Schemas */}
          <SidebarGroup className="p-1 pt-0">
            <Collapsible open={expandedSection === 'schemas' && forcedCollapsed !== 'schemas'}>
              <SidebarMenuItem className="list-none">
                <CollapsibleTrigger asChild>
                  <Link
                    to="/docs/schemas"
                    search={(prev) => prev}
                    onClick={(e) => {
                      if (isSchemasRoute) {
                        e.preventDefault();
                        setForcedCollapsed((prev) => (prev === 'schemas' ? null : 'schemas'));
                      } else {
                        setForcedCollapsed(null);
                      }
                    }}
                    className={cn(
                      buttonVariants({ variant: 'ghost' }),
                      'w-full justify-start font-normal group px-3 lowercase',
                      isSchemasRoute && 'font-medium bg-accent',
                    )}
                  >
                    <span>{t('common:schema', { count: 2 })}</span>
                    {(expandedSection !== 'schemas' || forcedCollapsed === 'schemas') && schemas && (
                      <span className="ml-2 text-xs text-muted-foreground/90 font-light">{schemas.length}</span>
                    )}
                    <ChevronDownIcon
                      className={cn(
                        'size-4 ml-auto transition-transform duration-200 opacity-40',
                        expandedSection === 'schemas' && forcedCollapsed !== 'schemas' && 'rotate-180',
                      )}
                    />
                  </Link>
                </CollapsibleTrigger>
              </SidebarMenuItem>
              <CollapsibleContent forceMount className="overflow-hidden data-[state=closed]:hidden">
                <SidebarGroupContent>
                  {/* Schemas tags list */}
                  <Suspense fallback={null}>
                    <SchemasSidebar />
                  </Suspense>
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
              onClick={closeSheet}
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
                    to="/docs/page/$id"
                    params={{ id: page.id }}
                    className={cn(
                      buttonVariants({ variant: 'ghost' }),
                      'w-full justify-start font-normal group px-3 lowercase',
                    )}
                    onClick={closeSheet}
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
      <Suspense>{DebugDropdown ? <DebugDropdown className="mt-auto p-4" /> : null}</Suspense>
    </SidebarContent>
  );
}
