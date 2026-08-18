import type { PlacementDescriptor, Slot } from '~/lib/placements';
import type { NavItemId } from '~/modules/navigation/types';

export type BoundaryType = 'root' | 'app' | 'public';

declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    boundary?: BoundaryType;
    isAuth: boolean;
    floatingNavButtons?: {
      right?: NavItemId;
      left?: NavItemId;
    };
    /** Nav tab placement for PageTabNav: default order 0, lower first, ties keep route order. */
    navTab?: PlacementDescriptor;
    /** Binds the tab bar to this slot so registry tab tools merge in; absent = route-file tabs keyed by parent route id. */
    tabsSlot?: Slot;
  }
}
