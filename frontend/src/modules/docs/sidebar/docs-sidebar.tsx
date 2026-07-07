import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { Link, useRouterState } from '@tanstack/react-router';
import { ChevronDownIcon, PencilIcon } from 'lucide-react';
import { Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { Logo } from '~/modules/common/logo';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { JsonActions } from '~/modules/docs/json-actions';
import { operationsQueryOptions, schemasQueryOptions, tagsQueryOptions } from '~/modules/docs/query';
import { OperationsSidebar } from '~/modules/docs/sidebar/operations-sidebar';
import { PagesSidebar } from '~/modules/docs/sidebar/pages-sidebar';
import { SchemasSidebar } from '~/modules/docs/sidebar/schemas-sidebar';
import type { GenTagSummary } from '~/modules/docs/types';
import { Button, buttonVariants } from '~/modules/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '~/modules/ui/collapsible';
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenuItem,
} from '~/modules/ui/sidebar';
import { useUserStore } from '~/modules/user/user-store';
import { queryClient } from '~/query/query-client';
import { cn } from '~/utils/cn';
import { lazyNamed } from '~/utils/lazy-named';
import { useSheeter } from '../../common/sheeter/use-sheeter';
import { UserTheme } from '../../me/user-theme';
import { openApiSpecQueryOptions, openApiUrl } from '../query';

const DebugDropdown =
  appConfig.mode !== 'production'
    ? lazyNamed(() => import('~/modules/common/debug-dropdown'), 'DebugDropdown')
    : () => null;

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
      resourceName={t('c:docs.openapi_json')}
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
  const isMobile = useBreakpointBelow('sm', false);

  const { isSystemAdmin } = useUserStore();

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
    <SidebarContent className="min-h-screen bg-card pt-4 pb-12">
      {/* Logo */}
      <div className="my-2 flex justify-center px-4">
        <Link
          to="/about"
          draggable={false}
          className="focus-effect inline-block rounded-md transition-transform hover:scale-105 active:scale-100"
          aria-label="Go to homepage"
          onClick={closeSheet}
        >
          <Logo height={32} />
        </Link>
      </div>

      {/* API spec action buttons and user theme */}
      {!isMobile && (
        <SidebarGroup>
          <div className="flex items-center justify-center gap-2">
            <Suspense fallback={<div className="h-8 w-48 rounded-md border border-input bg-background/50" />}>
              <OpenApiJsonActions />
            </Suspense>
          </div>
        </SidebarGroup>
      )}

      {/* Theme & sign in */}
      <SidebarGroup>
        <div className="flex items-center justify-center gap-4">
          <Button
            size="xs"
            draggable={false}
            variant="ghost"
            className="h-8"
            render={<Link to="/auth/authenticate" preload={false} />}
          >
            {t('c:sign_in')}
          </Button>

          <UserTheme buttonClassName="size-8" />
        </div>
      </SidebarGroup>

      {/* API reference */}
      <SidebarGroup>
        <div className="flex items-center gap-3 px-4 pr-1 pb-1">
          <SidebarGroupLabel className="p-0 lowercase opacity-75">{t('c:docs.api_reference')}</SidebarGroupLabel>
        </div>

        <SidebarGroupContent>
          {/* Operations */}
          <SidebarGroup className="p-1 pt-0">
            <Collapsible open={isListMode && expandedSection === 'operations' && forcedCollapsed !== 'operations'}>
              <SidebarMenuItem className="list-none">
                <CollapsibleTrigger
                  render={
                    <Link
                      to="/docs/operations"
                      search={(prev) => prev}
                      onMouseEnter={prefetchOperations}
                      onFocus={prefetchOperations}
                      draggable={false}
                      onClick={(e) => {
                        // If already on operations list route, toggle collapse
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
                      isListMode &&
                        expandedSection === 'operations' &&
                        forcedCollapsed !== 'operations' &&
                        'rotate-180',
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
                  {/* Operation tags sidebar */}
                  <Suspense fallback={null}>
                    <OperationsSidebar activeTag={activeOperationTag} />
                  </Suspense>
                </SidebarGroupContent>
              </CollapsibleContent>
            </Collapsible>
          </SidebarGroup>

          {/* Schemas */}
          <SidebarGroup className="p-1 pt-0">
            <Collapsible open={expandedSection === 'schemas' && forcedCollapsed !== 'schemas'}>
              <SidebarMenuItem className="list-none">
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
                          // Only clear if schemas was forcibly collapsed, preserve other section's state
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
                  {/* Schemas tags list */}
                  <Suspense fallback={null}>
                    <SchemasSidebar activeTag={activeSchemaTag} />
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
          <SidebarGroupLabel className="p-0 lowercase opacity-75">{t('c:documentation')}</SidebarGroupLabel>
          {/* Edit pages */}
          {isSystemAdmin && (
            <TooltipButton toolTipContent={t('c:manage_pages')} side="right">
              <Button
                variant="ghost"
                size="xs"
                className="h-7 w-8 p-0"
                render={<Link to="/docs/pages" onClick={closeSheet} aria-label={t('c:manage_pages')} />}
              >
                <PencilIcon size={14} />
              </Button>
            </TooltipButton>
          )}
        </div>
        {/* List of pages */}
        <SidebarGroupContent>
          {/* Inner SidebarGroup mirrors the operations/schemas wrappers so tier-1 bullets
              and guideline align with the API reference section (their p-1 adds 4px left). */}
          <SidebarGroup className="p-1 pt-0">
            <PagesSidebar onClose={closeSheet} />
          </SidebarGroup>
        </SidebarGroupContent>
      </SidebarGroup>

      {/* Debug Toolbars */}
      <Suspense>{DebugDropdown ? <DebugDropdown className="absolute bottom-0 m-1" /> : null}</Suspense>
    </SidebarContent>
  );
}
