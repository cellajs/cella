import type { AnyRoute } from '@tanstack/react-router';
import { Link, type LinkComponentProps } from '@tanstack/react-router';
import { motion } from 'motion/react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { nanoid } from 'shared/nanoid';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { useMountedState } from '~/hooks/use-mounted-state';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import { useScrollReset } from '~/modules/common/scroll-reset';
import { StickyBox } from '~/modules/common/sticky-box';
import router from '~/routes/router';
import { cn } from '~/utils/cn';
import { truncateMiddle } from '~/utils/truncate-middle';

export type PageTab = {
  id: string;
  label: string;
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

/**
 * Extract navigation tabs from child routes based on their staticData.navTab configuration.
 * Only routes with navTab defined in staticData will be included.
 */
function useNavTabs(parentRouteId: string, filterTabIds?: string[]): PageTab[] {
  if (!parentRouteId) return [];

  const routesById = router.routesById;
  if (!hasRoute(routesById, parentRouteId)) return [];

  const parentRoute = routesById[parentRouteId];
  const children = getChildRoutes(parentRoute);

  const tabs: PageTab[] = children
    .map((route) => {
      const navTab = route.options?.staticData?.navTab;
      if (!navTab) return null;
      return {
        id: navTab.id,
        label: navTab.label,
        path: route.fullPath as PageTab['path'],
      };
    })
    .filter((tab): tab is PageTab => tab !== null);

  if (filterTabIds) {
    return tabs.filter((tab) => filterTabIds.includes(tab.id));
  }

  return tabs;
}

interface Props {
  /** Explicit tabs array - if provided, takes precedence over parentRouteId */
  tabs?: PageTab[];
  /** Parent route ID to auto-generate tabs from child routes with staticData.navTab */
  parentRouteId?: string;
  /** Filter which tab IDs to show (for permission-based filtering) */
  filterTabIds?: string[];
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
export const PageTabNav = ({
  tabs: explicitTabs,
  parentRouteId,
  filterTabIds,
  title,
  avatar,
  fallbackToFirst,
  className,
}: Props) => {
  const { t } = useTranslation();
  const isMobile = useBreakpointBelow('sm', false);
  const { hasStarted } = useMountedState();

  // Use explicit tabs or auto-generate from parent route's children
  const autoTabs = useNavTabs(parentRouteId ?? '', filterTabIds);
  const tabs = explicitTabs ?? autoTabs;

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
      <div className="max-w-screen overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
};
