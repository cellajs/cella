import { type AnyRoute, Link, type LinkComponentProps, redirect, useNavigate, useRouterState } from '@tanstack/react-router';
import { type ReactNode, useEffect, useRef } from 'react';
import { appConfig, type ChannelEntityType, isChannel } from 'shared';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { settledAfterMountMs, useDelayedFlag } from '~/hooks/use-delayed-flag';
import {
  getSlotDescriptors,
  isPlacementHidden,
  type PlacementDescriptor,
  type ResolvePlacementOptions,
  resolvePlacementList,
  type Slot,
} from '~/lib/placements';
import type { AvatarEntity } from '~/modules/common/entity-avatar';
import { ActiveTabMarker, useTabIndicator } from '~/modules/common/page/tab-indicator';
import { type TabLabel, TabNavLabel, TabNavShell, tabNavItemClass } from '~/modules/common/page/tab-nav-shell';
import { useScrollResetOnNavigate } from '~/modules/common/scroll-reset';
import { getRouter } from '~/routes/-router-instance';
import { getHasNavigated } from '~/utils/nav-transition';

export type PageTab = TabLabel & {
  id: string;
  icon?: ReactNode;
  path: LinkComponentProps['to'];
  params?: LinkComponentProps['params'];
  search?: LinkComponentProps['search'];
  activeOptions?: LinkComponentProps['activeOptions'];
};

/** A tab that data adds to a surface, such as an LTI resource link: its id is the `$tool` param, its caption its own text. */
export type LinkedTab = { id: string; text: string };

/** What a surface's tabs resolve with: the placement inputs, and the tabs data adds after the declared ones. */
export interface NavTabOptions extends ResolvePlacementOptions {
  linkedTabs?: readonly LinkedTab[];
}

// Cast: generated FileRoutesById is a closed interface without index signature
const getRoutesById = () => getRouter().routesById as unknown as Record<string, AnyRoute>;

const getChildRoutes = (route: AnyRoute): AnyRoute[] => (Array.isArray(route.children) ? route.children : []);

/** The tabs slot a parent route binds its bar to; every tabbed surface declares one. */
const getTabsSlot = (parentRouteId: string): Slot | undefined => getRoutesById()[parentRouteId]?.options?.staticData?.tabsSlot;

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

type NavCandidate = PlacementDescriptor & { order: number; path: PageTab['path']; params: PageTab['params'] };

/** The `$tool` param of a match, naming a registry tab. */
const toolParam = (params: unknown) => (params as { tool?: string } | undefined)?.tool;

/** The candidate a location shows: registry tabs match on the `$tool` param, route tabs on the route path. */
const findActiveTab = (candidates: NavCandidate[], toolId: string | undefined, fullPath: string | undefined) =>
  toolId ? candidates.find((tab) => tab.id === toolId) : candidates.find((tab) => tab.path === fullPath);

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

/** The linked tabs of a surface, through its `$tool` host child; none without one. */
function getLinkedTabs(parentRouteId: string, linkedTabs: readonly LinkedTab[]): PageTab[] {
  const parentRoute: AnyRoute | undefined = getRoutesById()[parentRouteId];
  const hostChild = parentRoute && getChildRoutes(parentRoute).find((route) => route.path === '$tool');
  if (!hostChild) return [];
  return linkedTabs.map(({ id, text }) => ({
    id,
    text,
    path: hostChild.fullPath as PageTab['path'],
    // Cast: preserve the surface's own params (tenant/org), set only the host's `$tool` id
    params: ((prev: Record<string, string>) => ({ ...prev, tool: id })) as PageTab['params'],
  }));
}

/**
 * {@link getNavTabCandidates}, gated (`requires` on `grants`, `visibleTo` on `pairs`) and stably sorted on `order` (default 0,
 * lower first), then the linked tabs in their own order.
 */
function resolveNavTabs(parentRouteId: string, { linkedTabs = [], ...options }: NavTabOptions = {}): PageTab[] {
  const slot = getTabsSlot(parentRouteId);
  if (!slot) return [];

  const resolved = resolvePlacementList(slot, getNavTabCandidates(parentRouteId), options);
  const declared: PageTab[] = resolved.map(({ id, label, path, params }) => ({ id, label, path, params }));
  return [...declared, ...getLinkedTabs(parentRouteId, linkedTabs)];
}

/**
 * A channel's page tabs, gated and ordered as its page bar shows them, linked with `channelParams` so they work from any
 * page: route tabs take the channel's params as they are, registry tabs add their `$tool`.
 */
export function resolveChannelTabs(entityType: ChannelEntityType, channelParams: Record<string, string>, options: NavTabOptions = {}): PageTab[] {
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
export const defaultNavTabPath = (parentRouteId: string, options?: NavTabOptions): string | undefined =>
  resolveNavTabs(parentRouteId, options)[0]?.path;

/**
 * `beforeLoad` guard of a tabbed surface: before the route mounts and fetches, it redirects the bare parent, a tab that
 * `surfaces` or the channel arrangement hides ({@link isPlacementHidden}), and a tab whose `requires` the caller's `grants`
 * lack, to the landing tab, or to the layout's own path when no tab is left. Without `grants` (the memberships could not
 * be read) it leaves `requires` to the server, and it never reads `visibleTo`; {@link useNavTabRedirect} covers changes
 * while on a tab.
 * @throws A replacing redirect that keeps params and hash. It keeps a bare parent's search and drops a hidden tab's own sort and filters.
 */
export function guardNavTabs(
  matches: readonly { routeId: string; fullPath: string; params: unknown }[],
  parentRouteId: string,
  options: Pick<NavTabOptions, 'slotConfig' | 'grants' | 'linkedTabs'> = {},
): void {
  const deepest = matches[matches.length - 1];
  if (!deepest) return;

  const slot = getTabsSlot(parentRouteId);
  if (!slot) return;

  const fromBareParent = deepest.routeId === parentRouteId;
  let needsLanding = fromBareParent;
  if (!needsLanding) {
    const target = findActiveTab(getNavTabCandidates(parentRouteId), toolParam(deepest.params), deepest.fullPath);
    const ungranted = !!target?.requires && !!options.grants && !options.grants.includes(target.requires);
    needsLanding = target !== undefined && (isPlacementHidden(slot, target, options) || ungranted);
  }
  if (!needsLanding) return;

  // The landing tab is the first one this surface resolves: the app's `surfaces` order sets it.
  const landing = resolveNavTabs(parentRouteId, options)[0];
  if (landing) throw redirect({ to: landing.path, params: landing.params, search: fromBareParent ? true : {}, replace: true, hash: true });

  // No tab is left: a refused tab goes to the layout itself, which this guard then lets through, never in a loop.
  // Cast: a route's fullPath is a plain string; link paths are the loose LinkComponentProps, as for the tabs above.
  const layoutPath = getRoutesById()[parentRouteId]?.fullPath as PageTab['path'] | undefined;
  if (!fromBareParent && layoutPath) throw redirect({ to: layoutPath, params: true, search: {}, replace: true, hash: true });
}

/**
 * Replace-navigates to the first resolved tab while the location sits on a tab that `surfaces` or the channel arrangement
 * hides, judged on the arrangement layers as in {@link guardNavTabs}. {@link PageTabNav} runs it for route-derived bars.
 * @public
 */
export function useNavTabRedirect(parentRouteId: string, options: NavTabOptions = {}): void {
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

interface PageTabNavProps extends NavTabOptions {
  /** Takes precedence over parentRouteId. */
  tabs?: PageTab[];
  /** Derives the tabs from this route's children (`staticData.navTab`) and its tabs slot. */
  parentRouteId?: string;
  title?: string;
  avatar?: AvatarEntity;
  /** Marks the first tab active as well, for a location that matches none of the tabs. */
  fallbackToFirst?: boolean;
  /** The active tab, in place of the links' own match. A link never matches a search holding a list: the URL reads it back as text. */
  activeId?: string;
  /** While set, each change puts the active tab in the middle of the row, such as a search that narrows the page to it. */
  centerKey?: string;
  className?: string;
}

export function PageTabNav({
  tabs: explicitTabs,
  parentRouteId,
  title,
  avatar,
  fallbackToFirst,
  activeId,
  centerKey,
  className,
  ...placementOptions
}: PageTabNavProps) {
  const isMobile = useBreakpointBelow('sm', false);
  const hasStarted = useDelayedFlag(true, settledAfterMountMs);

  const tabs = explicitTabs ?? resolveNavTabs(parentRouteId ?? '', placementOptions);

  // Forward off a tab this surface has disabled (explicit tab lists opt out of route derivation)
  useNavTabRedirect(explicitTabs ? '' : (parentRouteId ?? ''), placementOptions);

  const indicator = useTabIndicator();
  const firstTabRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!isMobile && hasStarted && getHasNavigated()) firstTabRef.current?.focus();
  }, [hasStarted]);

  // The active tab has revealed itself by now, as child effects run first. On mount the row jumps, as a reveal does.
  const hasCenteredRef = useRef(false);
  useEffect(() => {
    if (centerKey === undefined) return;
    indicator.center(hasCenteredRef.current);
    hasCenteredRef.current = true;
  }, [centerKey, indicator]);

  const scrollToResetOnNavigate = useScrollResetOnNavigate();

  // The menu lists these tabs; the redirect above still keeps the page off a disabled tab
  const slot = parentRouteId ? getTabsSlot(parentRouteId) : undefined;
  if (!explicitTabs && slot && showsTabsInMenu(slot)) return null;

  return (
    <TabNavShell title={title} avatar={avatar} className={className} indicator={indicator}>
      {tabs.map(({ id, path, icon, search = {}, params = true, activeOptions = { exact: true, includeSearch: false }, ...caption }, index) => {
        const isMarked = activeId === undefined ? fallbackToFirst && index === 0 : activeId === id;

        return (
          <Link
            key={id}
            id={`tab-${id}`}
            ref={index === 0 ? firstTabRef : undefined}
            resetScroll={false}
            className={tabNavItemClass}
            to={path}
            draggable={false}
            data-active={isMarked || undefined}
            aria-current={isMarked ? 'page' : undefined}
            params={params}
            search={search}
            activeOptions={activeOptions}
            activeProps={activeId === undefined ? { 'data-active': true } : {}}
            onClick={scrollToResetOnNavigate}
          >
            {({ isActive }) => (
              <>
                <TabNavLabel {...caption} icon={icon} />
                {(activeId === undefined ? isActive || isMarked : isMarked) && <ActiveTabMarker indicator={indicator} />}
              </>
            )}
          </Link>
        );
      })}
    </TabNavShell>
  );
}
