import type { AnyRoute } from '@tanstack/react-router';
import { Link, type LinkComponentProps, redirect, useNavigate, useRouterState } from '@tanstack/react-router';
import { motion } from 'motion/react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { ContextRole, SlotToolsConfig } from 'shared/tools-config';
import { nanoid } from 'shared/utils/nanoid';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { useMountedState } from '~/hooks/use-mounted-state';
import type { TKey } from '~/lib/i18n-locales';
import {
  getSlotDescriptors,
  isPlacementHidden,
  type PlacementDescriptor,
  type PlacementOverrides,
  resolvePlacementList,
} from '~/lib/placements';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import { useScrollReset } from '~/modules/common/scroll-reset';
import { StickyBox } from '~/modules/common/sticky-box';
import { getRouter } from '~/routes/-router-instance';
import { cn } from '~/utils/cn';
import { truncateMiddle } from '~/utils/truncate-middle';

export type PageTab = {
  id: string;
  label: TKey;
  path: LinkComponentProps['to'];
  params?: LinkComponentProps['params'];
  search?: LinkComponentProps['search'];
  activeOptions?: LinkComponentProps['activeOptions'];
};

function hasRoute<TRoutes extends Record<string, AnyRoute>>(
  routes: TRoutes,
  routeId: string,
): routeId is Extract<keyof TRoutes, string> {
  return routeId in routes;
}

function getChildRoutes(route: AnyRoute): AnyRoute[] {
  return Array.isArray(route.children) ? route.children : [];
}

/** Override/arrangement host key for a tabbed surface: its tabs slot id when declared, else the parent route id. */
function getTabsHost(parentRouteId: string): string {
  // Cast: generated FileRoutesById is a closed interface without index signature
  const routesById = getRouter().routesById as unknown as Record<string, AnyRoute>;
  if (!hasRoute(routesById, parentRouteId)) return parentRouteId;
  return routesById[parentRouteId].options?.staticData?.tabsSlot ?? parentRouteId;
}

/** A resolved nav candidate: a placement descriptor plus where its tab links. */
export type NavCandidate = PlacementDescriptor & { order: number; path: PageTab['path']; params: PageTab['params'] };

/** Resolution inputs for a tabbed surface (all optional; absent conditions never hide a tab). */
export interface ResolveNavTabsOptions {
  /** Explicit allow-list of tab ids (prefer grant/pair gating over this). */
  filterTabIds?: string[];
  /** Grants the actor holds; tabs declaring `requires` hide without a match. */
  grants?: readonly string[];
  /** Context-role pairs the actor holds; registry tabs declaring `visibleTo` hide without a match. */
  pairs?: readonly ContextRole[];
  /** Channel-stored arrangement for the surface's tabs slot (order + hidden). */
  slotConfig?: SlotToolsConfig;
  /** App override map (defaults to `~/placement-config`). */
  overrides?: PlacementOverrides;
}

/**
 * All tab candidates a surface declares, ungated and unordered by stored config: child routes
 * with `staticData.navTab` (linked to their own path) plus, when the parent route declares
 * `staticData.tabsSlot`, that slot's registry tab tools (linked through the surface's `$tool`
 * host child). Management surfaces (the tabs arrangement card) read this raw list; rendering
 * goes through {@link resolveNavTabs}, which gates and orders it.
 */
export function getNavTabCandidates(parentRouteId: string): NavCandidate[] {
  if (!parentRouteId) return [];

  // Cast: generated FileRoutesById is a closed interface without index signature
  const routesById = getRouter().routesById as unknown as Record<string, AnyRoute>;
  if (!hasRoute(routesById, parentRouteId)) return [];

  const parentRoute = routesById[parentRouteId];
  const children = getChildRoutes(parentRoute);
  const slot = parentRoute.options?.staticData?.tabsSlot;

  // Route-file tabs: each child declaring staticData.navTab, linked to its own path.
  const routeCandidates = children
    .map((route): NavCandidate | null => {
      const navTab = route.options?.staticData?.navTab;
      if (!navTab) return null;
      // Cast: PageTab link props are the loose LinkComponentProps; `true` inherits current params
      return {
        ...navTab,
        order: navTab.order ?? 0,
        path: route.fullPath as PageTab['path'],
        params: true as PageTab['params'],
      };
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
 * Tabs for a tabbed surface: the {@link getNavTabCandidates} list, gated and ordered. App
 * overrides and channel arrangement key by the slot id when present, else the parent route id;
 * `requires` gates on `grants` and `visibleTo` on `pairs` before the stable sort on `order`
 * (default 0, lower first; ties keep registration order).
 */
export function resolveNavTabs(parentRouteId: string, options: ResolveNavTabsOptions = {}): PageTab[] {
  if (!parentRouteId) return [];

  // Cast: generated FileRoutesById is a closed interface without index signature
  const routesById = getRouter().routesById as unknown as Record<string, AnyRoute>;
  if (!hasRoute(routesById, parentRouteId)) return [];

  const resolved = resolvePlacementList(getTabsHost(parentRouteId), getNavTabCandidates(parentRouteId), {
    grants: options.grants,
    pairs: options.pairs,
    slotConfig: options.slotConfig,
    overrides: options.overrides,
  });

  const tabs: PageTab[] = resolved.map(({ id, label, path, params }) => ({ id, label, path, params }));

  if (options.filterTabIds) {
    const allow = options.filterTabIds;
    return tabs.filter((tab) => allow.includes(tab.id));
  }
  return tabs;
}

/**
 * First visible tab path under a parent route: the derived default-tab redirect target for
 * layout routes, so the landing tab follows `order` and app overrides.
 */
export function defaultNavTabPath(parentRouteId: string, options?: ResolveNavTabsOptions): string | undefined {
  return resolveNavTabs(parentRouteId, options)[0]?.path;
}

/** Landing preference for {@link guardNavTabs} (arrangement inputs only; see the guard's doc). */
export interface GuardNavTabsOptions {
  /** Channel-stored arrangement for the surface's tabs slot (order + hidden). */
  slotConfig?: SlotToolsConfig;
  /** Preferred landing tab id; falls back to the first resolved tab when absent or disabled. */
  defaultTabId?: string;
}

/**
 * `beforeLoad` guard for a tabbed surface: forwards a navigation that would land nowhere useful
 * before any tab route mounts or fetches. Two cases redirect to the surface's landing tab: the
 * bare parent layout (links and deep URLs stay tab-less), and a tab candidate that app overrides
 * or channel-stored arrangement disable. Without the guard, the disabled tab's route would mount,
 * fire its suspense queries, and only then forward, costing a second transition and a wasted
 * fetch. Detection uses {@link isPlacementHidden}: the arrangement layers only, never
 * `requires`/`visibleTo` gating, whose inputs may still be loading and whose enforcement belongs
 * to the API. The landing tab prefers `defaultTabId` when the arrangement resolves it, else the
 * first resolved tab; with no resolved tabs the guard no-ops. Live config changes while sitting
 * on a tab are covered separately by {@link useNavTabRedirect}, since `beforeLoad` only reruns
 * on navigation.
 * @throws A history-replacing redirect preserving params, search, and hash.
 */
export function guardNavTabs(
  matches: readonly { routeId: string; fullPath: string; params: unknown }[],
  parentRouteId: string,
  options: GuardNavTabsOptions = {},
): void {
  const deepest = matches[matches.length - 1];
  if (!deepest) return;

  const { slotConfig, defaultTabId } = options;

  // Targeted candidate: registry tabs match on the deepest match's `$tool` param, route tabs on
  // its route path. A bare parent match (no tab in the URL) always needs the landing redirect.
  let needsLanding = deepest.routeId === parentRouteId;
  if (!needsLanding) {
    const candidates = getNavTabCandidates(parentRouteId);
    const toolId = (deepest.params as { tool?: string } | undefined)?.tool;
    const target = toolId
      ? candidates.find((tab) => tab.id === toolId)
      : candidates.find((tab) => tab.path === deepest.fullPath);
    needsLanding = target !== undefined && isPlacementHidden(getTabsHost(parentRouteId), target, { slotConfig });
  }
  if (!needsLanding) return;

  const tabs = resolveNavTabs(parentRouteId, { slotConfig });
  const landing = tabs.find((tab) => tab.id === defaultTabId) ?? tabs[0];
  if (!landing) return;

  throw redirect({ to: landing.path, params: landing.params, search: true, replace: true, hash: true });
}

/**
 * Forwards off a disabled tab: when the current location sits on a tab candidate that app
 * overrides or channel-stored arrangement hide, replace-navigates to the surface's first
 * resolved tab. Detection uses {@link isPlacementHidden} with the arrangement layers only, never
 * `requires`/`visibleTo` gating, whose inputs may still be loading and whose enforcement belongs
 * to the API. No-ops when the surface resolves no tabs to forward to. {@link PageTabNav} runs
 * this for route-derived tab bars, so every channel surface gets the forwarding without wiring.
 */
export function useNavTabRedirect(parentRouteId: string, options: ResolveNavTabsOptions = {}): void {
  const navigate = useNavigate();
  const leaf = useRouterState({ select: (state) => state.matches[state.matches.length - 1] });

  // Active candidate: registry tabs match on the leaf's `$tool` param, route tabs on its path
  const toolId = (leaf?.params as { tool?: string } | undefined)?.tool;
  const candidates = parentRouteId ? getNavTabCandidates(parentRouteId) : [];
  const active = toolId
    ? candidates.find((tab) => tab.id === toolId)
    : candidates.find((tab) => tab.path === leaf?.fullPath);

  const disabled = active !== undefined && isPlacementHidden(getTabsHost(parentRouteId), active, options);
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
  /** Filter which tab IDs to show (explicit allow-list; prefer `grants` + navTab.requires) */
  filterTabIds?: string[];
  /** Grants held by the current user; tabs declaring navTab.requires are hidden unless granted */
  grants?: readonly string[];
  /** Context-role pairs held by the current user; registry tabs declaring visibleTo hide without a match */
  pairs?: readonly ContextRole[];
  /** Channel-stored arrangement for the surface's tabs slot (order + hidden) */
  slotConfig?: SlotToolsConfig;
  title?: string;
  avatar?: {
    id: string;
    thumbnailUrl?: string | null;
    name: string;
  };
  fallbackToFirst?: boolean;
  className?: string;
}

/**
 * Horizontal page tab navigation
 */
export function PageTabNav({
  tabs: explicitTabs,
  parentRouteId,
  filterTabIds,
  grants,
  pairs,
  slotConfig,
  title,
  avatar,
  fallbackToFirst,
  className,
}: Props) {
  const { t } = useTranslation();
  const isMobile = useBreakpointBelow('sm', false);
  const { hasStarted } = useMountedState();

  // Use explicit tabs or auto-generate from parent route's children
  const autoTabs = resolveNavTabs(parentRouteId ?? '', { filterTabIds, grants, pairs, slotConfig });
  const tabs = explicitTabs ?? autoTabs;

  // Forward off a tab this surface has disabled (explicit tab lists opt out of route derivation)
  useNavTabRedirect(explicitTabs ? '' : (parentRouteId ?? ''), { filterTabIds, grants, pairs, slotConfig });

  const layoutId = useRef(nanoid()).current;

  const tabRefs = useRef<Record<string, HTMLAnchorElement | null>>({});

  // Focus the first tab on mount
  useEffect(() => {
    if (!isMobile && hasStarted && tabs[0]) tabRefs.current[tabs[0].id]?.focus();
  }, [hasStarted]);

  const scrollToReset = useScrollReset();

  const scrollTabIntoView = (id: string) => {
    const tab = tabRefs.current[id];
    tab?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  };

  return (
    <StickyBox
      publishVar="--sticky-stack-nav"
      className={cn('group/sticky z-80 block gap-1 border-b bg-background/75 text-center backdrop-blur-xs', className)}
    >
      <div className="absolute left-0 hidden h-full items-center sm:group-data-[sticky=true]/sticky:flex">
        {avatar && (
          <EntityAvatar
            className="m-3 h-5 w-5 text-xs"
            type="organization"
            id={avatar.id}
            name={avatar.name}
            url={avatar.thumbnailUrl}
          />
        )}
        {title && <div className="max-w-42 truncate font-semibold text-sm leading-5 sm:block">{title}</div>}
      </div>
      <div className="scrollbar-none max-w-screen overflow-x-auto [&::-webkit-scrollbar]:hidden">
        <div className="inline-flex min-w-max gap-1 px-1 sm:flex sm:justify-center">
          {tabs.map(
            (
              { id, path, label, search = {}, params = true, activeOptions = { exact: true, includeSearch: false } },
              index,
            ) => (
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
                  if (showAsActive) scrollTabIntoView(id);

                  return (
                    <>
                      <span className="block group-active:translate-y-[.05rem]">{truncateMiddle(t(label), 20)}</span>
                      {showAsActive && hasStarted && (
                        <motion.span
                          layoutId={layoutId}
                          transition={{ type: 'spring', duration: 0.4, bounce: 0, delay: 0.1 }}
                          className="absolute bottom-0 left-2 h-1 w-[calc(100%-1rem)] rounded-sm bg-primary"
                        />
                      )}
                      {showAsActive && !hasStarted && (
                        <span className="absolute bottom-0 left-2 h-1 w-[calc(100%-1rem)] rounded-sm bg-primary" />
                      )}
                    </>
                  );
                }}
              </Link>
            ),
          )}
        </div>
      </div>
    </StickyBox>
  );
}
