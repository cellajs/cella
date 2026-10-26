import type { AnyRoute } from '@tanstack/react-router';
import { Link, type LinkComponentProps, redirect, useNavigate, useRouterState } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { appConfig, type ChannelEntityType, isChannel } from 'shared';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { useMountedState } from '~/hooks/use-mounted-state';
import type { TKey } from '~/lib/i18n-locales';
import {
  assertSurfaceIds,
  getSlotDescriptors,
  isPlacementHidden,
  type PlacementDescriptor,
  type ResolvePlacementOptions,
  resolvePlacementList,
  type Slot,
} from '~/lib/placements';
import { ActiveTabMarker, useTabIndicator } from '~/modules/common/page/tab-indicator';
import { type TabNavAvatar, TabNavLabel, TabNavShell, tabNavItemClass } from '~/modules/common/page/tab-nav-shell';
import { useScrollResetOnNavigate } from '~/modules/common/scroll-reset';
import { getRouter } from '~/routes/-router-instance';

export type PageTab = {
  id: string;
  label: TKey;
  path: LinkComponentProps['to'];
  params?: LinkComponentProps['params'];
  search?: LinkComponentProps['search'];
  activeOptions?: LinkComponentProps['activeOptions'];
};

// Cast: generated FileRoutesById is a closed interface without index signature
const getRoutesById = () => getRouter().routesById as unknown as Record<string, AnyRoute>;

function getChildRoutes(route: AnyRoute): AnyRoute[] {
  return Array.isArray(route.children) ? route.children : [];
}

/** The tabs slot a parent route binds its bar to; every tabbed surface declares one. */
function getTabsSlot(parentRouteId: string): Slot | undefined {
  return getRoutesById()[parentRouteId]?.options?.staticData?.tabsSlot;
}

/** The layout route whose bar shows `slot`'s tabs. */
function getTabsRouteId(slot: Slot): string | undefined {
  const routesById = getRoutesById();
  return Object.keys(routesById).find((routeId) => routesById[routeId].options?.staticData?.tabsSlot === slot);
}

/** Whether a channel type's page tabs show in the menu, in place of its page header's tab bar (`appConfig.navigation.pageTabs`). */
export function channelTabsInMenu(entityType: ChannelEntityType): boolean {
  return appConfig.navigation.pageTabs[entityType] === 'menu';
}

/** Whether `slot` is a channel's tabs slot that shows in the menu. */
function showsTabsInMenu(slot: Slot): boolean {
  const [entityType, surface] = slot.split('.');
  return surface === 'tabs' && isChannel(entityType) && channelTabsInMenu(entityType);
}

export type NavCandidate = PlacementDescriptor & { order: number; path: PageTab['path']; params: PageTab['params'] };

/** The `$tool` param of a match, naming a registry tab. */
const toolParam = (params: unknown) => (params as { tool?: string } | undefined)?.tool;

/** The candidate a location shows: registry tabs match on the `$tool` param, route tabs on the route path. */
function findActiveTab(candidates: NavCandidate[], toolId: string | undefined, fullPath: string | undefined) {
  return toolId ? candidates.find((tab) => tab.id === toolId) : candidates.find((tab) => tab.path === fullPath);
}

/**
 * Startup check, once the router exists so route tabs count: a layout whose child routes declare `navTab` but which names
 * no `tabsSlot` renders an empty bar, and a `surfaces` id that names no placement hides a tab or section, both without an
 * error. Throws outside production; production logs it, since a crash over one misspelled id is the worse failure.
 */
export function assertSurfaces(): void {
  const routesById = getRoutesById();

  try {
    for (const [routeId, route] of Object.entries(routesById)) {
      if (route.options?.staticData?.tabsSlot) continue;
      if (getChildRoutes(route).some((child) => child.options?.staticData?.navTab)) {
        throw new Error(`Route '${routeId}' has child routes with a navTab and declares no staticData.tabsSlot, so its tab bar stays empty`);
      }
    }
    assertSurfaceIds((slot) => {
      const parentRouteId = getTabsRouteId(slot);
      const tabIds = parentRouteId ? getNavTabCandidates(parentRouteId).map((tab) => tab.id) : [];
      return [...tabIds, ...getSlotDescriptors(slot).map((descriptor) => descriptor.id)];
    });
  } catch (error) {
    if (appConfig.mode !== 'production') throw error;
    console.error('[surfaces]', error);
  }
}

/**
 * Every tab a surface declares, ungated and unordered: child routes with `staticData.navTab`, plus the tools of the parent's
 * `staticData.tabsSlot` through its `$tool` child. {@link resolveNavTabs} gates and orders them.
 */
export function getNavTabCandidates(parentRouteId: string): NavCandidate[] {
  const parentRoute: AnyRoute | undefined = getRoutesById()[parentRouteId];
  if (!parentRoute) return [];

  const children = getChildRoutes(parentRoute);
  const slot = parentRoute.options?.staticData?.tabsSlot;

  // Route-file tabs: each child declaring staticData.navTab, linked to its own path
  const routeCandidates = children
    .map((route): NavCandidate | null => {
      const navTab = route.options?.staticData?.navTab;
      if (!navTab) return null;
      // Cast: PageTab link props are the loose LinkComponentProps; `true` inherits current params
      return { ...navTab, order: navTab.order ?? 0, path: route.fullPath as PageTab['path'], params: true as PageTab['params'] };
    })
    .filter((tab): tab is NavCandidate => tab !== null);

  // Registry tabs: the surface's slot tools, linked through its `$tool` host child.
  const hostChild = children.find((route) => route.path === '$tool');
  const registryCandidates: NavCandidate[] =
    slot && hostChild
      ? getSlotDescriptors(slot).map((tool) => ({
          ...tool,
          order: tool.order ?? 0,
          path: hostChild.fullPath as PageTab['path'],
          // Cast: preserve the surface's own params (tenant/org), set only the host's `$tool` id
          params: ((prev: Record<string, string>) => ({ ...prev, tool: tool.id })) as PageTab['params'],
        }))
      : [];

  return [...routeCandidates, ...registryCandidates];
}

/** {@link getNavTabCandidates}, gated (`requires` on `grants`, `visibleTo` on `pairs`) and stably sorted on `order` (default 0, lower first). */
function resolveNavTabs(parentRouteId: string, options: ResolvePlacementOptions = {}): PageTab[] {
  const slot = getTabsSlot(parentRouteId);
  if (!slot) return [];

  const resolved = resolvePlacementList(slot, getNavTabCandidates(parentRouteId), options);
  return resolved.map(({ id, label, path, params }) => ({ id, label, path, params }));
}

/**
 * A channel's page tabs, gated and ordered as its page bar shows them, linked with `channelParams` so they work from any
 * page: route tabs take the channel's params as they are, registry tabs add their `$tool`.
 */
export function resolveChannelTabs(
  entityType: ChannelEntityType,
  channelParams: Record<string, string>,
  options: ResolvePlacementOptions = {},
): PageTab[] {
  const routeId = getTabsRouteId(`${entityType}.tabs`);
  if (!routeId) return [];

  return resolveNavTabs(routeId, options).map((tab) => ({
    ...tab,
    params: typeof tab.params === 'function' ? { ...channelParams, tool: tab.id } : channelParams,
  }));
}

/**
 * First visible tab path under a parent route: the default-tab redirect target for layout routes.
 * @public
 */
export function defaultNavTabPath(parentRouteId: string, options?: ResolvePlacementOptions): string | undefined {
  return resolveNavTabs(parentRouteId, options)[0]?.path;
}

/**
 * `beforeLoad` guard of a tabbed surface: before the route mounts and fetches, it redirects the bare parent, and a tab that
 * `surfaces` or the channel arrangement hides, to the landing tab. It reads only the arrangement layers ({@link isPlacementHidden}),
 * never `requires`/`visibleTo`, whose inputs may still be loading; {@link useNavTabRedirect} covers changes while on a tab.
 * @throws A replacing redirect that keeps params and hash. It keeps a bare parent's search and drops a hidden tab's own sort and filters.
 */
export function guardNavTabs(
  matches: readonly { routeId: string; fullPath: string; params: unknown }[],
  parentRouteId: string,
  options: Pick<ResolvePlacementOptions, 'slotConfig'> = {},
): void {
  const deepest = matches[matches.length - 1];
  if (!deepest) return;

  const slot = getTabsSlot(parentRouteId);
  if (!slot) return;

  const fromBareParent = deepest.routeId === parentRouteId;
  let needsLanding = fromBareParent;
  if (!needsLanding) {
    const target = findActiveTab(getNavTabCandidates(parentRouteId), toolParam(deepest.params), deepest.fullPath);
    needsLanding = target !== undefined && isPlacementHidden(slot, target, options);
  }
  if (!needsLanding) return;

  // The landing tab is the first one this surface resolves: the app's `surfaces` list sets it.
  const landing = resolveNavTabs(parentRouteId, options)[0];
  if (!landing) return;

  throw redirect({ to: landing.path, params: landing.params, search: fromBareParent ? true : {}, replace: true, hash: true });
}

/**
 * Replace-navigates to the first resolved tab while the location sits on a tab that `surfaces` or the channel arrangement
 * hides, judged on the arrangement layers as in {@link guardNavTabs}. {@link PageTabNav} runs it for route-derived bars.
 * @public
 */
export function useNavTabRedirect(parentRouteId: string, options: ResolvePlacementOptions = {}): void {
  const navigate = useNavigate();
  // Primitives only: the leaf match object is new on every navigation
  const leafPath = useRouterState({ select: (state) => state.matches.at(-1)?.fullPath });
  const toolId = useRouterState({ select: (state) => toolParam(state.matches.at(-1)?.params) });

  const active = findActiveTab(getNavTabCandidates(parentRouteId), toolId, leafPath);

  const slot = getTabsSlot(parentRouteId);
  const disabled = slot !== undefined && active !== undefined && isPlacementHidden(slot, active, options);
  const target = disabled ? resolveNavTabs(parentRouteId, options)[0] : undefined;

  const targetId = target?.id;
  useEffect(() => {
    if (target) navigate({ to: target.path, params: target.params, replace: true });
  }, [navigate, targetId]);
}

interface PageTabNavProps extends ResolvePlacementOptions {
  /** Takes precedence over parentRouteId. */
  tabs?: PageTab[];
  /** Derives the tabs from this route's children (`staticData.navTab`) and its tabs slot. */
  parentRouteId?: string;
  title?: string;
  avatar?: TabNavAvatar;
  /** Marks the first tab active as well, for a location that matches none of the tabs. */
  fallbackToFirst?: boolean;
  className?: string;
}

export function PageTabNav({ tabs: explicitTabs, parentRouteId, title, avatar, fallbackToFirst, className, ...placementOptions }: PageTabNavProps) {
  const isMobile = useBreakpointBelow('sm', false);
  const { hasStarted } = useMountedState();

  const tabs = explicitTabs ?? resolveNavTabs(parentRouteId ?? '', placementOptions);

  // Forward off a tab this surface has disabled (explicit tab lists opt out of route derivation)
  useNavTabRedirect(explicitTabs ? '' : (parentRouteId ?? ''), placementOptions);

  const indicator = useTabIndicator();
  const firstTabRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!isMobile && hasStarted) firstTabRef.current?.focus();
  }, [hasStarted]);

  const scrollToResetOnNavigate = useScrollResetOnNavigate();

  // The menu lists these tabs; the redirect above still keeps the page off a disabled tab
  const slot = parentRouteId ? getTabsSlot(parentRouteId) : undefined;
  if (!explicitTabs && slot && showsTabsInMenu(slot)) return null;

  return (
    <TabNavShell title={title} avatar={avatar} className={className} indicator={indicator}>
      {tabs.map(({ id, path, label, search = {}, params = true, activeOptions = { exact: true, includeSearch: false } }, index) => (
        <Link
          key={id}
          id={`tab-${id}`}
          ref={index === 0 ? firstTabRef : undefined}
          resetScroll={false}
          className={tabNavItemClass}
          to={path}
          draggable={false}
          data-active={fallbackToFirst && index === 0 ? true : undefined}
          params={params}
          search={search}
          activeOptions={activeOptions}
          activeProps={{ 'data-active': true }}
          onClick={scrollToResetOnNavigate}
        >
          {({ isActive }) => {
            const showAsActive = isActive || (fallbackToFirst && index === 0);

            return (
              <>
                <TabNavLabel label={label} />
                {showAsActive && <ActiveTabMarker indicator={indicator} />}
              </>
            );
          }}
        </Link>
      ))}
    </TabNavShell>
  );
}
