import type { PlacementDescriptor, Slot } from '~/lib/placements';
import type { NavItemId } from '~/modules/navigation/types';

export type BoundaryType = 'root' | 'app' | 'public';

declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    boundary?: BoundaryType;
    isAuth: boolean;
    floatingNavButtons?: { right?: NavItemId; left?: NavItemId };
    /** Nav tab placement for PageTabNav: default order 0, lower first, ties keep route order. */
    navTab?: PlacementDescriptor;
    /** The placement surface this route's tab bar is: its tabs resolve against `appConfig.surfaces[tabsSlot]`. A tabbed layout route must declare it. */
    tabsSlot?: Slot;
  }
}
