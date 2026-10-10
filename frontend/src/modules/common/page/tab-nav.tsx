import type { AnyRoute } from '@tanstack/react-router';
import { Link, type LinkComponentProps, redirect, useNavigate, useRouterState } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import type { ContextRole, SlotToolsConfig } from 'shared/tools-config';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { useMountedState } from '~/hooks/use-mounted-state';
import type { TKey } from '~/lib/i18n-locales';
import { assertSurfaceIds, getSlotDescriptors, isPlacementHidden, type PlacementDescriptor, resolvePlacementList, type Slot } from '~/lib/placements';
import { ActiveTabMarker, useTabIndicator } from '~/modules/common/page/tab-indicator';
import { type TabNavAvatar, TabNavShell } from '~/modules/common/page/tab-nav-shell';
import { useScrollReset } from '~/modules/common/scroll-reset';
import { getRouter } from '~/routes/-router-instance';
import { truncateMiddle } from '~/utils/truncate-middle';

export type PageTab = {
  id: string;
  label: TKey;
  path: LinkComponentProps['to'];
  params?: LinkComponentProps['params'];
  search?: LinkComponentProps['search'];
  activeOptions?: LinkComponentProps['activeOptions'];
};

function hasRoute<TRoutes extends Record<string, AnyRoute>>(routes: TRoutes, routeId: string): routeId is Extract<keyof TRoutes, string> {
  return routeId in routes;
}

function getChildRoutes(route: AnyRoute): AnyRoute[] {
  return Array.isArray(route.children) ? route.children : [];
}

/** The tabs slot a parent route binds its bar to; every tabbed surface declares one. */
function getTabsSlot(parentRouteId: string): Slot | undefined {
  // Cast: generated FileRoutesById is a closed interface without index signature
  const routesById = getRouter().routesById as unknown as Record<string, AnyRoute>;
  if (!hasRoute(routesById, parentRouteId)) return undefined;
  return routesById[parentRouteId].options?.staticData?.tabsSlot;
}

export type NavCandidate = PlacementDescriptor & { order: number; path: PageTab['path']; params: PageTab['params'] };

/**
 * Startup check on the tab bars and on `appConfig.surfaces`: a layout whose child routes declare
 * `navTab` while it names no `tabsSlot` renders an empty bar, and a listed id that names no
 * placement of its surface would hide a tab or section, both without an error. Called once the
 * router exists, so route-declared tabs count. Throws outside production, where a hard crash over
 * one misspelled id would be the worse failure.
 */
export function assertSurfaces(): void {
  const routesById = getRouter().routesById as unknown as Record<string, AnyRoute>;
  const parentRouteIdForSlot = (slot: Slot) => Object.keys(routesById).find((routeId) => routesById[routeId].options?.staticData?.tabsSlot === slot);

  try {
    for (const [routeId, route] of Object.entries(routesById)) {
      if (route.options?.staticData?.tabsSlot) continue;
      if (getChildRoutes(route).some((child) => child.options?.staticData?.navTab)) {
        throw new Error(`Route '${routeId}' has child routes with a navTab and declares no staticData.tabsSlot, so its tab bar stays empty`);
      }
    }
    assertSurfaceIds((slot) => {
      const parentRouteId = parentRouteIdForSlot(slot);
      const tabIds = parentRouteId ? getNavTabCandidates(parentRouteId).map((tab) => tab.id) : [];
      return [...tabIds, ...getSlotDescriptors(slot).map((descriptor) => descriptor.id)];
    });
  } catch (error) {
    if (appConfig.mode !== 'production') throw error;
    console.error('[surfaces]', error);
  }
}

/** Resolution inputs for a tabbed surface. An absent condition never hides a tab. */
export interface ResolveNavTabsOptions {
  /** Grants the actor holds; tabs declaring `requires` hide without a match. */
  grants?: readonly string[];
  /** Context-role pairs the actor holds; registry tabs declaring `visibleTo` hide without a match. */
  pairs?: readonly ContextRole[];
  /** Channel-stored arrangement for the surface's tabs slot (order + hidden). */
  slotConfig?: SlotToolsConfig;
}

/**
 * All tab candidates a surface declares, ungated and unordered: child routes with
 * `staticData.navTab` plus, when the parent declares `staticData.tabsSlot`, that slot's registry
 * tools. Rendering goes through {@link resolveNavTabs}, which gates and orders this list.
 */
export function getNavTabCandidates(parentRouteId: string): NavCandidate[] {
  if (!parentRouteId) return [];

  const routesById = getRouter().routesById as unknown as Record<string, AnyRoute>;
  if (!hasRoute(routesById, parentRouteId)) return [];

  const parentRoute = routesById[parentRouteId];
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

/**
 * The {@link getNavTabCandidates} list, gated and ordered: `requires` gates on `grants` and
 * `visibleTo` on `pairs`, then a stable sort on `order` (default 0, lower first).
 */
export function resolveNavTabs(parentRouteId: string, options: ResolveNavTabsOptions = {}): PageTab[] {
  if (!parentRouteId) return [];

  const routesById = getRouter().routesById as unknown as Record<string, AnyRoute>;
  if (!hasRoute(routesById, parentRouteId)) return [];

  const slot = getTabsSlot(parentRouteId);
  if (!slot) return [];

  const resolved = resolvePlacementList(slot, getNavTabCandidates(parentRouteId), {
    grants: options.grants,
    pairs: options.pairs,
    slotConfig: options.slotConfig,
  });

  return resolved.map(({ id, label, path, params }) => ({ id, label, path, params }));
}

/**
 * First visible tab path under a parent route: the default-tab redirect target for layout routes.
 * @public
 */
export function defaultNavTabPath(parentRouteId: string, options?: ResolveNavTabsOptions): string | undefined {
  return resolveNavTabs(parentRouteId, options)[0]?.path;
}

export interface GuardNavTabsOptions {
  slotConfig?: SlotToolsConfig;
}

/**
 * `beforeLoad` guard for a tabbed surface: redirects to the landing tab from the bare parent
 * layout and from a tab the app's `surfaces` list or the channel arrangement disables, before that tab's
 * route mounts and fetches. Detection uses {@link isPlacementHidden} on the arrangement layers
 * only, never `requires`/`visibleTo`, whose inputs may still be loading. Config changes while
 * sitting on a tab are handled by {@link useNavTabRedirect}.
 * @throws A history-replacing redirect preserving params, search, and hash.
 */
export function guardNavTabs(
  matches: readonly { routeId: string; fullPath: string; params: unknown }[],
  parentRouteId: string,
  options: GuardNavTabsOptions = {},
): void {
  const deepest = matches[matches.length - 1];
  if (!deepest) return;

  const { slotConfig } = options;
  const slot = getTabsSlot(parentRouteId);
  if (!slot) return;

  // Data-defined tabs match on the deepest match's `$tool` param, route tabs on its route path
  let needsLanding = deepest.routeId === parentRouteId;
  if (!needsLanding) {
    const candidates = getNavTabCandidates(parentRouteId);
    const toolId = (deepest.params as { tool?: string } | undefined)?.tool;
    const target = toolId ? candidates.find((tab) => tab.id === toolId) : candidates.find((tab) => tab.path === deepest.fullPath);
    needsLanding = target !== undefined && isPlacementHidden(slot, target, { slotConfig });
  }
  if (!needsLanding) return;

  // The landing tab is the first one this surface resolves: the app's `surfaces` list sets it.
  const landing = resolveNavTabs(parentRouteId, { slotConfig })[0];
  if (!landing) return;

  throw redirect({ to: landing.path, params: landing.params, search: true, replace: true, hash: true });
}

/**
 * Replace-navigates to the first resolved tab when the current location sits on a tab the app's
 * `surfaces` list or the channel arrangement hides. Detection uses {@link isPlacementHidden} on the
 * arrangement layers only, never `requires`/`visibleTo`. {@link PageTabNav} runs this for
 * route-derived tab bars.
 * @public
 */
export function useNavTabRedirect(parentRouteId: string, options: ResolveNavTabsOptions = {}): void {
  const navigate = useNavigate();
  // Primitives only: the leaf match object is new on every navigation
  const leafPath = useRouterState({ select: (state) => state.matches.at(-1)?.fullPath });
  const toolId = useRouterState({ select: (state) => (state.matches.at(-1)?.params as { tool?: string } | undefined)?.tool });

  const candidates = parentRouteId ? getNavTabCandidates(parentRouteId) : [];
  const active = toolId ? candidates.find((tab) => tab.id === toolId) : candidates.find((tab) => tab.path === leafPath);

  const slot = getTabsSlot(parentRouteId);
  const disabled = slot !== undefined && active !== undefined && isPlacementHidden(slot, active, options);
  const target = disabled ? resolveNavTabs(parentRouteId, options)[0] : undefined;

  const targetId = target?.id;
  useEffect(() => {
    if (target) navigate({ to: target.path, params: target.params, replace: true });
  }, [navigate, targetId]);
}

interface Props {
  /** Explicit tabs array - if provided, takes precedence over parentRouteId */
  tabs?: PageTab[];
  /** Parent route ID to auto-generate tabs from child routes with staticData.navTab */
  parentRouteId?: string;
  grants?: readonly string[];
  pairs?: readonly ContextRole[];
  slotConfig?: SlotToolsConfig;
  title?: string;
  avatar?: TabNavAvatar;
  fallbackToFirst?: boolean;
  className?: string;
}

export function PageTabNav({ tabs: explicitTabs, parentRouteId, grants, pairs, slotConfig, title, avatar, fallbackToFirst, className }: Props) {
  const { t } = useTranslation();
  const isMobile = useBreakpointBelow('sm', false);
  const { hasStarted } = useMountedState();

  const autoTabs = resolveNavTabs(parentRouteId ?? '', { grants, pairs, slotConfig });
  const tabs = explicitTabs ?? autoTabs;

  // Forward off a tab this surface has disabled (explicit tab lists opt out of route derivation)
  useNavTabRedirect(explicitTabs ? '' : (parentRouteId ?? ''), { grants, pairs, slotConfig });

  const indicator = useTabIndicator();
  const tabRefs = useRef<Record<string, HTMLAnchorElement | null>>({});

  useEffect(() => {
    if (!isMobile && hasStarted && tabs[0]) tabRefs.current[tabs[0].id]?.focus();
  }, [hasStarted]);

  const scrollToReset = useScrollReset();

  return (
    <TabNavShell title={title} avatar={avatar} className={className} indicator={indicator}>
      {tabs.map(({ id, path, label, search = {}, params = true, activeOptions = { exact: true, includeSearch: false } }, index) => (
        <Link
          key={id}
          id={`tab-${id}`}
          ref={(el) => {
            if (el) tabRefs.current[id] = el;
          }}
          resetScroll={false}
          className="focus-effect group relative rounded-sm px-2 py-3 font-medium opacity-70 ring-inset ring-offset-0 transition-opacity last:mr-4 hover:opacity-100 data-[active=true]:opacity-100 lg:px-4"
          to={path}
          draggable={false}
          data-active={fallbackToFirst && index === 0 ? true : undefined}
          params={params}
          search={search}
          activeOptions={activeOptions}
          activeProps={{ 'data-active': true }}
          onClick={scrollToReset}
        >
          {({ isActive }) => {
            const showAsActive = isActive || (fallbackToFirst && index === 0);

            return (
              <>
                <span className="group-active:press block">{truncateMiddle(t(label), 20)}</span>
                {showAsActive && <ActiveTabMarker indicator={indicator} />}
              </>
            );
          }}
        </Link>
      ))}
    </TabNavShell>
  );
}
